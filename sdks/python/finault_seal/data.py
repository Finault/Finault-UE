"""
SealData — Immutable dataclass representing a single Finault Seal.

A Seal is a cryptographic receipt capturing WHO decided, WHAT happened,
WHERE it occurred, the OUTCOME, and PROOF of integrity.

Once created, a SealData instance is frozen — no field can be modified.
This enforces the append-only guarantee at the object level.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class SealData:
    """Immutable representation of a Finault Seal."""

    # ── Identity — WHO ──────────────────────────────────────────────
    seal_id: str = ""
    org_id: str = ""
    agent_id: str = ""
    principal_id: str = ""

    # ── Decision — WHAT + WHY ───────────────────────────────────────
    action: str = ""
    input_hash: str = ""
    model: str = ""
    model_version: str = ""
    reasoning: str = ""
    alternatives: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = -1.0

    # ── Context — WHERE + HOW ───────────────────────────────────────
    protocol: str = "REST"
    provider: str = ""
    session_id: str = ""
    parent_seal_id: str = ""

    # ── Outcome — WHAT HAPPENED ─────────────────────────────────────
    outcome: Dict[str, Any] = field(default_factory=dict)
    outcome_hash: str = ""
    cost_usd: float = -1.0
    tokens_used: int = -1
    latency_ms: float = -1.0

    # ── Integrity — PROOF ───────────────────────────────────────────
    timestamp: str = ""
    sequence: int = 0
    prev_hash: str = "0" * 64
    seal_hash: str = ""
    signature: str = ""
    blockchain_anchor: str = ""

    # ── Metadata ────────────────────────────────────────────────────
    seal_version: str = "1.0.0"
    tags: List[str] = field(default_factory=list)
    custom: Dict[str, Any] = field(default_factory=dict)

    # ── Serialisation ───────────────────────────────────────────────

    def to_dict(self) -> Dict[str, Any]:
        """Convert to plain dict for JSON serialisation."""
        return asdict(self)

    def to_json(self, indent: Optional[int] = None) -> str:
        """Serialise to canonical JSON (sorted keys, deterministic)."""
        return json.dumps(self.to_dict(), sort_keys=True, default=str, indent=indent)

    def hashable_dict(self) -> Dict[str, Any]:
        """Return dict used for seal_hash computation.

        Excludes ``seal_hash`` and ``signature`` — those are computed FROM
        this dict, so including them would create a circular dependency.
        """
        d = self.to_dict()
        d.pop("seal_hash", None)
        d.pop("signature", None)
        return d

    def hashable_json(self) -> str:
        """Canonical JSON of the hashable fields (for hashing)."""
        return json.dumps(self.hashable_dict(), sort_keys=True, default=str)

    # ── Factory ─────────────────────────────────────────────────────

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SealData":
        """Create a SealData from a plain dict, ignoring unknown keys."""
        known = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known}
        return cls(**filtered)

    @classmethod
    def from_json(cls, raw: str) -> "SealData":
        """Deserialise from JSON string."""
        return cls.from_dict(json.loads(raw))

    # ── Display ─────────────────────────────────────────────────────

    def __repr__(self) -> str:
        return (
            f"SealData(seal_id={self.seal_id!r}, action={self.action!r}, "
            f"agent_id={self.agent_id!r}, seq={self.sequence})"
        )

    def summary(self) -> str:
        """One-line human-readable summary."""
        cost = f"${self.cost_usd:.4f}" if self.cost_usd >= 0 else "n/a"
        return (
            f"[{self.seal_id}] {self.agent_id}/{self.action} "
            f"model={self.model or 'none'} cost={cost} "
            f"seq={self.sequence} chain={'valid' if self.seal_hash else 'unsigned'}"
        )
