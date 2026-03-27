"""
@sealed decorator — zero-change integration for existing functions.

Usage:
    from finault_seal import sealed

    @sealed(agent_id="pricing-agent")
    def calculate_price(customer_id: str, items: list) -> dict:
        return {"total": 99.99}

    # Every call to calculate_price() automatically generates a Seal:
    #   input_hash  = SHA-256 of (customer_id, items)
    #   outcome     = return value
    #   latency_ms  = execution time
    #   action      = "calculate_price" (function name)
"""

from __future__ import annotations

import functools
import time
from typing import Any, Callable, Dict, List, Optional

from .client import SealClient
from .crypto import SealCrypto


# Module-level default client (lazy-initialised on first use)
_default_client: Optional[SealClient] = None


def _get_default_client() -> SealClient:
    global _default_client
    if _default_client is None:
        _default_client = SealClient()
    return _default_client


def sealed(
    agent_id: str,
    *,
    client: Optional[SealClient] = None,
    model: str = "",
    protocol: str = "REST",
    provider: str = "",
    tags: Optional[List[str]] = None,
    action: Optional[str] = None,
    include_args: bool = True,
    include_result: bool = True,
) -> Callable:
    """Decorator that automatically seals every invocation of a function.

    Parameters
    ----------
    agent_id : str
        The agent identity for the seal.
    client : SealClient, optional
        Custom client.  Uses module-level default if not provided.
    model : str, optional
        Model used (if applicable).
    action : str, optional
        Override action name.  Defaults to the function name.
    include_args : bool
        If True, hash function arguments as input_hash.
    include_result : bool
        If True, include return value as outcome.
    """
    tags_list = tags or []

    def decorator(fn: Callable) -> Callable:
        fn_action = action or fn.__name__

        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            seal_client = client or _get_default_client()

            # Hash inputs
            input_hash = ""
            if include_args:
                input_data = {"args": args, "kwargs": kwargs}
                input_hash = SealCrypto.hash_content(input_data)

            # Execute the actual function
            start = time.perf_counter()
            error = None
            result = None
            try:
                result = fn(*args, **kwargs)
                return result
            except Exception as e:
                error = e
                raise
            finally:
                elapsed_ms = (time.perf_counter() - start) * 1000

                # Build outcome
                outcome: Dict[str, Any] = {}
                if error:
                    outcome = {"error": str(error), "error_type": type(error).__name__}
                elif include_result and result is not None:
                    if isinstance(result, dict):
                        outcome = result
                    else:
                        outcome = {"result": result}

                # Create the seal (fire-and-forget — never let sealing break the function)
                try:
                    seal_client.seal(
                        agent_id=agent_id,
                        action=fn_action,
                        input_hash=input_hash,
                        model=model,
                        protocol=protocol,
                        provider=provider,
                        outcome=outcome,
                        latency_ms=round(elapsed_ms, 4),
                        tags=[*tags_list, "decorator"],
                    )
                except Exception:
                    pass  # Never break the decorated function

        return wrapper
    return decorator
