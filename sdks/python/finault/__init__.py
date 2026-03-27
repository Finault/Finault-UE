"""
Finault Python SDK — AI Cost Governance Platform

Automatic cost tracking, sealed receipts, and attribution for AI API usage.
Integrates with OpenAI, Anthropic, AWS Bedrock, Google Vertex AI, and Azure OpenAI.

Installation:
    pip install finault

Quick Start (decorator-based tracking):
    from finault import Finault

    finault = Finault(api_key="fin_...")

    @finault.track_cost(feature="chat", customer="acme")
    def chat(message):
        return client.chat.completions.create(...)

Quick Start (client-based routing):
    from finault import FinaultClient

    client = FinaultClient(api_key="fk_live_...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
        provider_api_key="sk-..."
    )
    print(response.cost)

CLI:
    finault init --provider openai --api-key sk-...
    finault sync
    finault scan
    finault score
    finault close-pack
"""

from .version import __version__
from .decorators import Finault, SessionContext, get_default_finault
from .client import FinaultClient, EconomicContext
from .exceptions import (
    FinaultError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    APIError,
)

__author__ = "Finault Inc."
__license__ = "MIT"

__all__ = [
    # Core classes
    "Finault",
    "FinaultClient",
    "EconomicContext",
    "SessionContext",
    # Exceptions
    "FinaultError",
    "AuthenticationError",
    "RateLimitError",
    "ValidationError",
    "APIError",
    # Helpers
    "get_default_finault",
    # Version
    "__version__",
]
