"""
Finault Python SDK — Cost Tracking Decorators

Provides decorators and context managers for automatic cost tracking and attribution
in Python applications using AI APIs. Integrates with OpenAI and other LLM clients
to inject Finault cost center headers into all requests.

Usage Example:
    from finault import Finault

    finault = Finault(api_key="fin_...", base_url="https://api.finault.ai")

    @finault.track_cost(feature="summarization", customer="acme")
    def summarize(text):
        return client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": text}]
        )

    # Or with dynamic customer from function args:
    @finault.track_cost(feature="chat", customer_from="customer_id")
    def chat(message, customer_id=None):
        return client.chat.completions.create(...)

    # Session tracking groups related calls:
    with finault.session() as session:
        result1 = summarize(text)  # All calls share this session_id
        result2 = chat(result1)
"""

import functools
import uuid
import threading
import os
import inspect
from contextlib import contextmanager
from typing import Optional, Dict, Any, Callable, List


class Finault:
    """Finault SDK client for cost tracking and attribution.

    Attributes:
        api_key (str): API key for authentication with Finault
        base_url (str): Base URL for Finault API (default: https://api.finault.ai)
        _session_local (threading.local): Thread-local storage for session context
    """

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        """Initialize Finault SDK client.

        Args:
            api_key: Finault API key. If not provided, reads from FINAULT_API_KEY env var.
            base_url: Base URL for Finault API. If not provided, defaults to https://api.finault.ai
                     or reads from FINAULT_BASE_URL env var.
        """
        self.api_key = api_key or os.environ.get("FINAULT_API_KEY")
        self.base_url = (
            base_url
            or os.environ.get("FINAULT_BASE_URL", "https://api.finault.ai")
        )
        self._session_local = threading.local()

        if not self.api_key:
            raise ValueError(
                "Finault API key must be provided or set in FINAULT_API_KEY environment variable"
            )

    @property
    def current_session_id(self) -> Optional[str]:
        """Get the current session ID from thread-local context.

        Returns:
            Session ID if in active session context, None otherwise.
        """
        return getattr(self._session_local, "session_id", None)

    @contextmanager
    def session(self, session_id: Optional[str] = None):
        """Context manager for session tracking.

        Groups related AI API calls under a single session for cohesive cost tracking.
        All calls within the context share the same session_id in their headers.

        Args:
            session_id: Optional custom session ID. If not provided, generates UUID.

        Yields:
            str: The session ID (either provided or generated)

        Example:
            with finault.session() as session:
                result1 = call_ai_function1()
                result2 = call_ai_function2()
                # Both calls share the same session_id
        """
        sid = session_id or f"sess_{uuid.uuid4().hex[:16]}"
        old = self.current_session_id
        self._session_local.session_id = sid

        try:
            yield sid
        finally:
            self._session_local.session_id = old

    def track_cost(
        self,
        feature: Optional[str] = None,
        customer: Optional[str] = None,
        customer_from: Optional[str] = None,
        product: Optional[str] = None,
        team: Optional[str] = None,
        extra_tags: Optional[Dict[str, str]] = None,
    ) -> Callable:
        """Decorator that injects Finault cost tracking headers into AI API calls.

        Wraps a function to automatically inject Finault cost center headers
        into any HTTP requests made during execution. Supports both static
        and dynamic (from function arguments) cost center attribution.

        Args:
            feature: Feature name for cost attribution (e.g., "chat", "summarization")
            customer: Static customer identifier. Ignored if customer_from is provided.
            customer_from: Parameter name to extract customer ID from function arguments.
                          Can reference both positional and keyword arguments.
            product: Product line for cost attribution (e.g., "enterprise", "platform")
            team: Team identifier for cost attribution
            extra_tags: Dictionary of additional key-value tags for cost attribution

        Returns:
            Callable: Decorator function

        Example:
            @finault.track_cost(feature="chat", customer="acme")
            def chat(message):
                return client.chat.completions.create(...)

            @finault.track_cost(feature="summarize", customer_from="org_id")
            def summarize(text, org_id):
                return client.chat.completions.create(...)
        """

        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args, **kwargs) -> Any:
                # Resolve customer identifier
                cust = customer
                if customer_from:
                    cust = self._resolve_argument(func, customer_from, args, kwargs)

                # Build cost center string from component parts
                cost_center = self._build_cost_center(
                    customer=cust,
                    feature=feature,
                    product=product,
                    team=team,
                    extra_tags=extra_tags,
                )

                # Prepare headers for middleware/interceptor
                headers = {"X-Finault-Cost-Center": cost_center}

                if self.current_session_id:
                    headers["X-Finault-Session-Id"] = self.current_session_id

                # Store headers in thread-local for interceptor to pick up
                self._session_local.pending_headers = headers

                try:
                    result = func(*args, **kwargs)
                    return result
                finally:
                    self._session_local.pending_headers = None

            return wrapper

        return decorator

    @staticmethod
    def _resolve_argument(
        func: Callable, arg_name: str, args: tuple, kwargs: dict
    ) -> Optional[str]:
        """Resolve an argument value from function arguments.

        Attempts to find the argument value by checking kwargs first,
        then positional args by inspecting the function signature.

        Args:
            func: Function to inspect
            arg_name: Name of argument to find
            args: Positional arguments
            kwargs: Keyword arguments

        Returns:
            Argument value if found, None otherwise
        """
        # Check kwargs first
        if arg_name in kwargs:
            return kwargs[arg_name]

        # Inspect function signature
        try:
            sig = inspect.signature(func)
            params = list(sig.parameters.keys())

            if arg_name in params:
                idx = params.index(arg_name)
                if idx < len(args):
                    return args[idx]
        except (ValueError, TypeError):
            pass

        return None

    @staticmethod
    def _build_cost_center(
        customer: Optional[str] = None,
        feature: Optional[str] = None,
        product: Optional[str] = None,
        team: Optional[str] = None,
        extra_tags: Optional[Dict[str, str]] = None,
    ) -> str:
        """Build cost center header value from component parts.

        Format: customer:value|feature:value|product:value|team:value|custom:value

        Args:
            customer: Customer identifier
            feature: Feature name
            product: Product line
            team: Team identifier
            extra_tags: Additional tags as key-value pairs

        Returns:
            Formatted cost center string
        """
        parts: List[str] = []

        if customer:
            parts.append(f"customer:{customer}")
        if feature:
            parts.append(f"feature:{feature}")
        if product:
            parts.append(f"product:{product}")
        if team:
            parts.append(f"team:{team}")
        if extra_tags:
            for key, value in extra_tags.items():
                # Sanitize key for header format
                safe_key = key.replace(" ", "_").replace(":", "")
                parts.append(f"{safe_key}:{value}")

        return "|".join(parts)

    def get_pending_headers(self) -> Dict[str, str]:
        """Get pending Finault headers for the current context.

        Used by HTTP interceptors and middleware to read the headers
        that should be injected into the next AI API request.

        Returns:
            Dictionary of headers, or empty dict if none pending
        """
        return getattr(self._session_local, "pending_headers", None) or {}

    def create_openai_client(self, original_client_class=None):
        """Create an OpenAI-compatible client that routes through Finault.

        Instantiates an OpenAI client configured to use Finault as a gateway,
        automatically routing all requests through Finault's cost tracking.

        Args:
            original_client_class: OpenAI client class. If not provided, attempts
                                  to import from openai package.

        Returns:
            Configured OpenAI client instance

        Example:
            from openai import OpenAI
            client = finault.create_openai_client(OpenAI)
            response = client.chat.completions.create(...)
        """
        if original_client_class is None:
            try:
                from openai import OpenAI as original_client_class
            except ImportError:
                raise ImportError(
                    "OpenAI Python package not found. "
                    "Install with: pip install openai"
                )

        return original_client_class(
            base_url=f"{self.base_url}/v1",
            api_key=self.api_key,
            default_headers={
                "X-Finault-API-Key": self.api_key,
            },
        )

    def create_session_context(self, session_id: Optional[str] = None) -> "SessionContext":
        """Create a session context for grouped cost tracking.

        Alternative to using session() as context manager. Useful when
        session lifetime doesn't align with a with-block.

        Args:
            session_id: Optional custom session ID

        Returns:
            SessionContext instance
        """
        return SessionContext(self, session_id)


class SessionContext:
    """Manual session context manager for fine-grained session control.

    Allows managing session lifetime without using with-statement syntax.

    Example:
        session = finault.create_session_context()
        session.start()
        try:
            result = expensive_operation()
        finally:
            session.end()
    """

    def __init__(self, finault_client: Finault, session_id: Optional[str] = None):
        """Initialize session context.

        Args:
            finault_client: Parent Finault client instance
            session_id: Optional custom session ID
        """
        self.finault_client = finault_client
        self.session_id = session_id or f"sess_{uuid.uuid4().hex[:16]}"
        self._previous_session_id = None

    def start(self):
        """Start the session, setting it as active in thread-local context."""
        self._previous_session_id = self.finault_client.current_session_id
        self.finault_client._session_local.session_id = self.session_id

    def end(self):
        """End the session, restoring previous session context."""
        self.finault_client._session_local.session_id = self._previous_session_id

    def __enter__(self):
        """Context manager entry."""
        self.start()
        return self.session_id

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.end()
        return False


# Module-level convenience instance (optional)
_default_finault: Optional[Finault] = None


def get_default_finault() -> Finault:
    """Get or create the default Finault instance.

    Useful for applications that want a singleton instance.
    Reads API key from FINAULT_API_KEY environment variable.

    Returns:
        Default Finault instance

    Raises:
        ValueError: If FINAULT_API_KEY environment variable not set
    """
    global _default_finault
    if _default_finault is None:
        _default_finault = Finault()
    return _default_finault


__all__ = [
    "Finault",
    "SessionContext",
    "get_default_finault",
]
