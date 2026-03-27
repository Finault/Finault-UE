"""
SealCrypto — Pure cryptographic primitives for the Finault Seal.

Zero external dependencies.  Uses only Python stdlib: hashlib, hmac, json.
The optional ``cryptography`` package is used for Ed25519 when available.

All methods are static — no state, no side effects, fully deterministic.
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import json
from typing import Any, Dict, Optional


class SealCrypto:
    """Static cryptographic utilities for sealing and verification."""

    # ── Hashing ─────────────────────────────────────────────────────

    @staticmethod
    def sha256(data) -> str:
        """SHA-256 → 64-char hex digest.  Accepts str or bytes."""
        if isinstance(data, str):
            data = data.encode("utf-8")
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def hash_content(content: Any) -> str:
        """Hash arbitrary content.

        - ``str`` → encode UTF-8 then SHA-256
        - ``bytes`` → SHA-256 directly
        - anything else → canonical JSON then SHA-256
        """
        if isinstance(content, bytes):
            raw = content
        elif isinstance(content, str):
            raw = content.encode("utf-8")
        else:
            raw = json.dumps(content, sort_keys=True, default=str).encode("utf-8")
        return SealCrypto.sha256(raw)

    @staticmethod
    def hash_outcome(outcome: Dict[str, Any]) -> str:
        """Compute outcome_hash per spec: SHA-256 of canonical JSON."""
        canonical = json.dumps(outcome, sort_keys=True, default=str)
        return SealCrypto.sha256(canonical.encode("utf-8"))

    @staticmethod
    def compute_seal_hash(hashable_dict: Dict[str, Any]) -> str:
        """Compute seal_hash from the hashable dict (all fields minus seal_hash & signature)."""
        canonical = json.dumps(hashable_dict, sort_keys=True, default=str)
        return SealCrypto.sha256(canonical.encode("utf-8"))

    # ── HMAC-SHA256 Signing ─────────────────────────────────────────

    @staticmethod
    def hmac_sign(seal_hash: str, secret: str) -> str:
        """HMAC-SHA256 signature of seal_hash using the API secret."""
        return _hmac.new(
            secret.encode("utf-8"),
            seal_hash.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def hmac_verify(data: str, secret: str, signature: str) -> bool:
        """Constant-time verification of HMAC-SHA256 signature.

        Parameters: data (the signed content), secret (the key), signature (to verify).
        """
        expected = SealCrypto.hmac_sign(data, secret)
        return _hmac.compare_digest(expected, signature)

    # ── Ed25519 (optional — requires ``cryptography`` package) ──────

    @staticmethod
    def ed25519_sign(seal_hash: str, private_key_bytes: bytes) -> str:
        """Sign seal_hash with Ed25519 private key. Returns hex signature.

        Raises ImportError if ``cryptography`` is not installed.
        """
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        key = Ed25519PrivateKey.from_private_bytes(private_key_bytes)
        sig = key.sign(seal_hash.encode("utf-8"))
        return sig.hex()

    @staticmethod
    def ed25519_verify(seal_hash: str, signature_hex: str, public_key_bytes: bytes) -> bool:
        """Verify Ed25519 signature. Returns True/False.

        Raises ImportError if ``cryptography`` is not installed.
        """
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.exceptions import InvalidSignature

        key = Ed25519PublicKey.from_public_bytes(public_key_bytes)
        try:
            key.verify(bytes.fromhex(signature_hex), seal_hash.encode("utf-8"))
            return True
        except InvalidSignature:
            return False

    # ── Merkle Tree (for blockchain anchoring) ──────────────────────

    @staticmethod
    def merkle_root(hashes: list[str]) -> str:
        """Compute the Merkle root of a list of hex hash strings.

        Empty list → "0" * 64.  Single element → itself.
        Odd lists duplicate the last element.
        """
        if not hashes:
            return "0" * 64
        layer = list(hashes)
        while len(layer) > 1:
            if len(layer) % 2 == 1:
                layer.append(layer[-1])  # duplicate last for odd count
            next_layer = []
            for i in range(0, len(layer), 2):
                combined = (layer[i] + layer[i + 1]).encode("utf-8")
                next_layer.append(hashlib.sha256(combined).hexdigest())
            layer = next_layer
        return layer[0]

    @staticmethod
    def merkle_proof(hashes: list[str], index: int) -> list[dict]:
        """Generate a Merkle proof for the element at ``index``.

        Returns a list of {hash, position} dicts where position is 'left' or 'right'.
        """
        if not hashes or index < 0 or index >= len(hashes):
            return []
        layer = list(hashes)
        proof: list[dict] = []
        idx = index
        while len(layer) > 1:
            if len(layer) % 2 == 1:
                layer.append(layer[-1])
            if idx % 2 == 0:
                sibling = idx + 1
                proof.append({"hash": layer[sibling], "position": "right"})
            else:
                sibling = idx - 1
                proof.append({"hash": layer[sibling], "position": "left"})
            # Move to next layer
            next_layer = []
            for i in range(0, len(layer), 2):
                combined = (layer[i] + layer[i + 1]).encode("utf-8")
                next_layer.append(hashlib.sha256(combined).hexdigest())
            layer = next_layer
            idx = idx // 2
        return proof

    @staticmethod
    def verify_merkle_proof(leaf_hash: str, proof: list[dict], root: str) -> bool:
        """Verify a Merkle proof against a known root."""
        current = leaf_hash
        for step in proof:
            if step["position"] == "left":
                combined = (step["hash"] + current).encode("utf-8")
            else:
                combined = (current + step["hash"]).encode("utf-8")
            current = hashlib.sha256(combined).hexdigest()
        return current == root
