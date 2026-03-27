"""
Finault Seal — Cryptographic receipts for every AI decision.

Installation:
    pip install finault-seal

Quick Start:
    from finault_seal import SealClient

    client = SealClient()  # reads FINAULT_API_KEY from env
    seal = client.seal(
        agent_id="my-agent",
        action="decision_made",
        outcome={"result": "approved"},
    )

Decorator pattern:
    from finault_seal import sealed

    @sealed(agent_id="pricing-agent")
    def calculate_price(customer_id, items):
        return {"total": 99.99}
"""

from .data import SealData
from .crypto import SealCrypto
from .chain import SealChain
from .client import SealClient
from .decorator import sealed

__version__ = "1.0.0"
__author__ = "Finault"
__license__ = "MIT"

__all__ = [
    "SealData",
    "SealCrypto",
    "SealChain",
    "SealClient",
    "sealed",
]
