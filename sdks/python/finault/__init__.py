"""
Finault Python SDK

Automatic cost tracking and attribution for AI API usage.
Integrates with OpenAI, Anthropic, and other LLM providers.

Installation:
    pip install finault

Quick Start:
    from finault import Finault

    finault = Finault(api_key="fin_...")

    @finault.track_cost(feature="chat", customer="acme")
    def chat(message):
        return client.chat.completions.create(...)

    result = chat("Hello, how are you?")
"""

from .decorators import Finault, SessionContext, get_default_finault

__version__ = "0.3.0"
__author__ = "Finault"
__license__ = "MIT"

__all__ = [
    "Finault",
    "SessionContext",
    "get_default_finault",
]
