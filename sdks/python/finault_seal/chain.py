"""
SealChain — Append-only local chain of Finault Seals.

Thread-safe.  Supports full verification, export, and offline audit.
The chain enforces ordering: each seal's prev_hash must equal the
previous seal's seal_hash.  Breaking one seal invalidates everything after it.
"""

from __future__ import annotations

import json
import threading
from typing import Any, Dict, List, Optional, Tuple

from .data import SealData
from .crypto import SealCrypto


class ChainIntegrityError(Exception):
    """Raised when chain verification detects a broken link."""

    def __init__(self, index: int, seal_id: str, detail: str):
        self.index = index
        self.seal_id = seal_id
        self.detail = detail
        super().__init__(f"Chain broken at index {index} (seal {seal_id}): {detail}")


class SealChain:
    """Append-only, thread-safe chain of SealData objects.

    Parameters
    ----------
    org_id : str
        Organisation that owns this chain.
    """

    def __init__(self, org_id: str = ""):
        self.org_id = org_id
        self._seals: List[SealData] = []
        self._lock = threading.Lock()

    # ── Properties ──────────────────────────────────────────────────

    @property
    def length(self) -> int:
        return len(self._seals)

    @property
    def last_hash(self) -> str:
        """Hash of the most recent seal, or genesis zero-hash."""
        if self._seals:
            return self._seals[-1].seal_hash
        return "0" * 64

    @property
    def last_sequence(self) -> int:
        if self._seals:
            return self._seals[-1].sequence
        return 0

    @property
    def last_seal(self) -> Optional[SealData]:
        return self._seals[-1] if self._seals else None

    # ── Core operations ─────────────────────────────────────────────

    def append(self, seal: SealData) -> SealData:
        """Append an already-finalised seal to the chain.

        Validates that ``seal.prev_hash`` matches the current chain head.
        Thread-safe via internal lock.
        """
        with self._lock:
            expected = self.last_hash
            if seal.prev_hash != expected:
                raise ChainIntegrityError(
                    len(self._seals),
                    seal.seal_id,
                    f"prev_hash {seal.prev_hash[:16]}… != expected {expected[:16]}…",
                )
            self._seals.append(seal)
        return seal

    def get(self, index: int) -> SealData:
        """Get seal by chain index (0-based)."""
        return self._seals[index]

    def find(self, seal_id: str) -> Optional[SealData]:
        """Find seal by seal_id. Returns None if not found."""
        for s in self._seals:
            if s.seal_id == seal_id:
                return s
        return None

    def slice(self, start: int = 0, end: Optional[int] = None) -> List[SealData]:
        """Return a slice of the chain (copies)."""
        return list(self._seals[start:end])

    # ── Verification ────────────────────────────────────────────────

    def verify(self, secret: Optional[str] = None) -> Tuple[bool, List[Dict[str, Any]]]:
        """Walk the entire chain and verify integrity.

        Returns (is_valid, checks) where checks is a list of per-seal results.
        If ``secret`` is provided, also verifies HMAC signatures.
        """
        checks: List[Dict[str, Any]] = []
        prev_hash = "0" * 64
        valid = True

        for i, seal in enumerate(self._seals):
            check: Dict[str, Any] = {
                "index": i,
                "seal_id": seal.seal_id,
                "sequence": seal.sequence,
                "hash_integrity": False,
                "chain_link_valid": False,
                "signature_valid": None,
                "sequence_valid": False,
            }

            # 1. Recompute seal_hash and compare
            recomputed = SealCrypto.compute_seal_hash(seal.hashable_dict())
            check["hash_integrity"] = recomputed == seal.seal_hash

            # 2. Check prev_hash chain link
            check["chain_link_valid"] = seal.prev_hash == prev_hash

            # 3. Check sequence monotonicity
            expected_seq = i + 1 if i == 0 else self._seals[i - 1].sequence + 1
            # Allow first seal to have any sequence >= 1
            if i == 0:
                check["sequence_valid"] = seal.sequence >= 1
            else:
                check["sequence_valid"] = seal.sequence == expected_seq

            # 4. Verify signature if secret provided
            if secret and seal.signature:
                check["signature_valid"] = SealCrypto.hmac_verify(
                    seal.seal_hash, secret, seal.signature
                )
            elif secret:
                check["signature_valid"] = False

            if not (check["hash_integrity"] and check["chain_link_valid"]):
                valid = False

            if check["signature_valid"] is False and secret:
                valid = False

            checks.append(check)
            prev_hash = seal.seal_hash

        return valid, checks

    def verify_or_raise(self, secret: Optional[str] = None) -> List[Dict[str, Any]]:
        """Verify chain; raise ChainIntegrityError on first failure."""
        is_valid, checks = self.verify(secret)
        if not is_valid:
            for c in checks:
                if not c["hash_integrity"]:
                    raise ChainIntegrityError(c["index"], c["seal_id"], "seal_hash mismatch")
                if not c["chain_link_valid"]:
                    raise ChainIntegrityError(c["index"], c["seal_id"], "prev_hash link broken")
                if c["signature_valid"] is False:
                    raise ChainIntegrityError(c["index"], c["seal_id"], "signature invalid")
        return checks

    # ── Export / Import ─────────────────────────────────────────────

    def export_json(self, indent: Optional[int] = 2) -> str:
        """Export entire chain as JSON array."""
        return json.dumps(
            [s.to_dict() for s in self._seals],
            sort_keys=True,
            default=str,
            indent=indent,
        )

    def export_csv(self) -> str:
        """Export chain as CSV — one row per seal, key fields only."""
        header = "seal_id,sequence,timestamp,agent_id,action,model,cost_usd,tokens_used,latency_ms,seal_hash,prev_hash"
        rows = [header]
        for s in self._seals:
            rows.append(
                f"{s.seal_id},{s.sequence},{s.timestamp},{s.agent_id},"
                f"{s.action},{s.model},{s.cost_usd},{s.tokens_used},"
                f"{s.latency_ms},{s.seal_hash},{s.prev_hash}"
            )
        return "\n".join(rows)

    @classmethod
    def from_json(cls, raw: str, org_id: str = "") -> "SealChain":
        """Import chain from JSON array. Verifies chain links on import."""
        data = json.loads(raw)
        chain = cls(org_id=org_id)
        for item in data:
            seal = SealData.from_dict(item)
            chain.append(seal)
        return chain

    # ── Merkle ──────────────────────────────────────────────────────

    def merkle_root(self, start: int = 0, end: Optional[int] = None) -> str:
        """Compute Merkle root of seal_hashes in range [start, end)."""
        seals = self._seals[start:end]
        hashes = [s.seal_hash for s in seals]
        return SealCrypto.merkle_root(hashes)

    # ── Dunder ──────────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self._seals)

    def __getitem__(self, index: int) -> SealData:
        return self._seals[index]

    def __iter__(self):
        return iter(self._seals)

    def __repr__(self) -> str:
        return f"SealChain(org={self.org_id!r}, length={self.length}, head={self.last_hash[:12]}…)"
