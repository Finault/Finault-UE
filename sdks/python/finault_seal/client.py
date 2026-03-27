"""
SealClient — The primary developer interface for Finault Seal.

Handles seal creation, signing, chain management, verification,
search, and export.  Supports both local-only mode (no network)
and API mode (syncs seals to Finault cloud).

Usage:
    from finault_seal import SealClient

    client = SealClient()  # reads FINAULT_API_KEY from env
    seal = client.seal(
        agent_id="support-bot-v2",
        action="refund_approved",
        input_hash=SealClient.hash(request_data),
        model="claude-sonnet-4-5",
        outcome={"refund_amount": 49.99},
    )
"""

from __future__ import annotations

import os
import json
import time
import uuid
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Callable

from .data import SealData
from .crypto import SealCrypto
from .chain import SealChain


def _generate_seal_id() -> str:
    """Generate seal_XXXXXXXXXXXX (12 hex chars from uuid4)."""
    return "seal_" + uuid.uuid4().hex[:12]


def _utc_now_iso() -> str:
    """UTC ISO 8601 timestamp with millisecond precision."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
           f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


class SealClient:
    """Main interface for creating, verifying, and managing Finault Seals.

    Parameters
    ----------
    api_key : str, optional
        Finault API key.  Falls back to ``FINAULT_API_KEY`` env var.
        Used for HMAC signing and (if api_url set) cloud sync.
    api_url : str, optional
        Finault API base URL for cloud sync.  Falls back to ``FINAULT_API_URL``
        or ``https://api.finault.ai``.  Set to ``""`` for local-only mode.
    org_id : str, optional
        Organisation ID.  Falls back to ``FINAULT_ORG_ID`` env var.
    auto_sync : bool
        If True and api_url is set, seals are asynchronously POSTed to cloud.
    on_seal : callable, optional
        Hook called with each SealData after creation.  Useful for logging,
        metrics, or custom sinks.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_url: Optional[str] = None,
        org_id: Optional[str] = None,
        auto_sync: bool = True,
        on_seal: Optional[Callable[[SealData], None]] = None,
        mode: Optional[str] = None,
    ):
        self._api_key = api_key or os.environ.get("FINAULT_API_KEY", "")
        # mode="local" disables cloud sync (equivalent to api_url="")
        if mode == "local":
            api_url = ""
        self._api_url = api_url if api_url is not None else os.environ.get(
            "FINAULT_API_URL", "https://api.finault.ai"
        )
        self._org_id = org_id or os.environ.get("FINAULT_ORG_ID", "")
        self._auto_sync = auto_sync
        self._on_seal = on_seal
        self._chain = SealChain(org_id=self._org_id)
        self._lock = threading.Lock()

    # ── Static helpers (convenience wrappers) ───────────────────────

    @staticmethod
    def hash(content: Any) -> str:
        """SHA-256 hash of arbitrary content.  Convenience wrapper.

        Usage:
            input_hash = SealClient.hash(request_data)
        """
        return SealCrypto.hash_content(content)

    @staticmethod
    def hash_outcome(outcome: Dict[str, Any]) -> str:
        """Hash an outcome dict per the Seal spec."""
        return SealCrypto.hash_outcome(outcome)

    # ── Core: seal() ────────────────────────────────────────────────

    def seal(
        self,
        *,
        agent_id: str,
        action: str,
        input_hash: str = "",
        model: str = "",
        model_version: str = "",
        reasoning: str = "",
        alternatives: Optional[List[Dict[str, Any]]] = None,
        confidence: float = -1.0,
        protocol: str = "REST",
        provider: str = "",
        session_id: str = "",
        parent_seal_id: str = "",
        outcome: Optional[Dict[str, Any]] = None,
        cost_usd: float = -1.0,
        tokens_used: int = -1,
        latency_ms: float = -1.0,
        tags: Optional[List[str]] = None,
        custom: Optional[Dict[str, Any]] = None,
        principal_id: str = "",
    ) -> SealData:
        """Create, sign, chain, and return a new Seal.

        This is the "3 lines" API::

            client = SealClient()
            seal = client.seal(agent_id="bot", action="decide", outcome={"ok": True})

        Parameters
        ----------
        agent_id : str
            Which agent or system is acting.
        action : str
            What was done (e.g. "refund_approved", "code_deployed").
        input_hash : str, optional
            SHA-256 of the input data.  Use ``SealClient.hash(data)`` to compute.
        outcome : dict, optional
            The result of the action.  Automatically hashed for ``outcome_hash``.
        """
        outcome = outcome or {}
        alternatives = alternatives or []
        tags = tags or []
        custom = custom or {}

        # Auto-compute hashes
        outcome_hash = SealCrypto.hash_outcome(outcome)
        if not input_hash:
            input_hash = "0" * 64  # No input provided

        seal_id = _generate_seal_id()
        ts = _utc_now_iso()

        with self._lock:
            sequence = self._chain.last_sequence + 1
            prev_hash = self._chain.last_hash

            # Build the immutable SealData (without seal_hash and signature yet)
            partial = SealData(
                seal_id=seal_id,
                org_id=self._org_id,
                agent_id=agent_id,
                principal_id=principal_id,
                action=action,
                input_hash=input_hash,
                model=model,
                model_version=model_version,
                reasoning=reasoning,
                alternatives=alternatives,
                confidence=confidence,
                protocol=protocol,
                provider=provider,
                session_id=session_id,
                parent_seal_id=parent_seal_id,
                outcome=outcome,
                outcome_hash=outcome_hash,
                cost_usd=cost_usd,
                tokens_used=tokens_used,
                latency_ms=latency_ms,
                timestamp=ts,
                sequence=sequence,
                prev_hash=prev_hash,
                seal_hash="",  # computed next
                signature="",  # computed next
                seal_version="1.0.0",
                tags=tags,
                custom=custom,
            )

            # Compute seal_hash over all fields except seal_hash + signature
            seal_hash = SealCrypto.compute_seal_hash(partial.hashable_dict())

            # Sign
            signature = ""
            if self._api_key:
                signature = SealCrypto.hmac_sign(seal_hash, self._api_key)

            # Create final immutable seal with hash + signature
            final = SealData(
                **{
                    **partial.to_dict(),
                    "seal_hash": seal_hash,
                    "signature": signature,
                }
            )

            # Append to local chain
            self._chain.append(final)

        # Async cloud sync (fire-and-forget)
        if self._auto_sync and self._api_url and self._api_key:
            self._sync_seal(final)

        # User hook
        if self._on_seal:
            try:
                self._on_seal(final)
            except Exception:
                pass  # Never let hook errors break sealing

        return final

    # ── Verification ────────────────────────────────────────────────

    def verify_seal(self, seal: SealData) -> Dict[str, Any]:
        """Verify a single seal's integrity.

        Returns dict with per-check results: hash_integrity, signature_valid,
        schema_valid, timestamp_valid.
        """
        result: Dict[str, Any] = {
            "valid": False,
            "checks": {
                "hash_integrity": False,
                "signature_valid": None,
                "schema_valid": False,
                "timestamp_valid": False,
            },
        }

        # Schema check
        result["checks"]["schema_valid"] = bool(
            seal.seal_id
            and seal.action
            and seal.seal_hash
            and seal.timestamp
            and seal.sequence >= 1
        )

        # Hash integrity
        recomputed = SealCrypto.compute_seal_hash(seal.hashable_dict())
        result["checks"]["hash_integrity"] = recomputed == seal.seal_hash

        # Signature
        if self._api_key and seal.signature:
            result["checks"]["signature_valid"] = SealCrypto.hmac_verify(
                seal.seal_hash, self._api_key, seal.signature
            )

        # Timestamp validity (not in the future, not absurdly old)
        try:
            ts = datetime.fromisoformat(seal.timestamp.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            result["checks"]["timestamp_valid"] = ts <= now
        except (ValueError, AttributeError):
            result["checks"]["timestamp_valid"] = False

        # Overall
        checks = result["checks"]
        result["valid"] = (
            checks["hash_integrity"]
            and checks["schema_valid"]
            and checks["timestamp_valid"]
            and (checks["signature_valid"] is not False)
        )
        return result

    # Alias: verify() → verify_seal()
    def verify(self, seal: SealData) -> Dict[str, Any]:
        """Alias for verify_seal(). Verify a single seal's integrity."""
        return self.verify_seal(seal)

    def verify_chain(self) -> Dict[str, Any]:
        """Verify the entire local chain."""
        is_valid, checks = self._chain.verify(
            secret=self._api_key if self._api_key else None
        )
        return {
            "valid": is_valid,
            "chain_length": self._chain.length,
            "checks": checks,
        }

    # ── Chain access ────────────────────────────────────────────────

    @property
    def chain(self) -> SealChain:
        """Access the underlying chain for advanced operations."""
        return self._chain

    @property
    def chain_length(self) -> int:
        return self._chain.length

    def get_seal(self, seal_id: str) -> Optional[SealData]:
        """Find a seal by ID in the local chain."""
        return self._chain.find(seal_id)

    def recent(self, n: int = 10) -> List[SealData]:
        """Return the N most recent seals."""
        start = max(0, self._chain.length - n)
        return self._chain.slice(start)

    # ── Export ──────────────────────────────────────────────────────

    def export_json(self, indent: int = 2) -> str:
        """Export entire chain as JSON."""
        return self._chain.export_json(indent=indent)

    def export_csv(self) -> str:
        """Export chain as CSV."""
        return self._chain.export_csv()

    def merkle_root(self) -> str:
        """Compute Merkle root of the entire chain."""
        return self._chain.merkle_root()

    # ── Search (local) ──────────────────────────────────────────────

    def search(
        self,
        *,
        agent_id: Optional[str] = None,
        action: Optional[str] = None,
        model: Optional[str] = None,
        after: Optional[str] = None,
        before: Optional[str] = None,
        tags: Optional[List[str]] = None,
        limit: int = 50,
    ) -> List[SealData]:
        """Search the local chain with filters."""
        results: List[SealData] = []
        for seal in reversed(list(self._chain)):
            if agent_id and seal.agent_id != agent_id:
                continue
            if action and seal.action != action:
                continue
            if model and seal.model != model:
                continue
            if tags and not set(tags).issubset(set(seal.tags)):
                continue
            if after and seal.timestamp < after:
                continue
            if before and seal.timestamp > before:
                continue
            results.append(seal)
            if len(results) >= limit:
                break
        return results

    # ── Stats ───────────────────────────────────────────────────────

    def stats(self) -> Dict[str, Any]:
        """Compute aggregate stats over the local chain."""
        if self._chain.length == 0:
            return {"total_seals": 0}

        agents = set()
        actions = {}
        total_cost = 0.0
        total_tokens = 0

        for seal in self._chain:
            agents.add(seal.agent_id)
            actions[seal.action] = actions.get(seal.action, 0) + 1
            if seal.cost_usd >= 0:
                total_cost += seal.cost_usd
            if seal.tokens_used >= 0:
                total_tokens += seal.tokens_used

        top_actions = sorted(actions.items(), key=lambda x: -x[1])[:10]

        return {
            "total_seals": self._chain.length,
            "unique_agents": len(agents),
            "agents": sorted(agents),
            "total_cost_usd": round(total_cost, 6),
            "total_tokens": total_tokens,
            "avg_cost_per_seal": round(total_cost / self._chain.length, 6) if total_cost > 0 else 0,
            "top_actions": top_actions,
            "chain_valid": self._chain.verify()[0],
            "merkle_root": self._chain.merkle_root(),
        }

    # ── Private: async cloud sync ───────────────────────────────────

    def _sync_seal(self, seal: SealData) -> None:
        """Fire-and-forget POST to Finault cloud (best-effort)."""
        try:
            import requests as _req
        except ImportError:
            return  # requests not installed, skip cloud sync

        def _post():
            try:
                _req.post(
                    f"{self._api_url}/v1/seals",
                    json=seal.to_dict(),
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    timeout=5,
                )
            except Exception:
                pass  # Best effort — never block the seal flow

        t = threading.Thread(target=_post, daemon=True)
        t.start()

    # ── Dunder ──────────────────────────────────────────────────────

    def __repr__(self) -> str:
        return (
            f"SealClient(org={self._org_id!r}, chain_len={self._chain.length}, "
            f"api={'connected' if self._api_url else 'local'})"
        )
