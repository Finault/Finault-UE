"""
Auto-Instrument Middleware for finault.wrap()
Wraps any LLM client (OpenAI, Anthropic, Google) to auto-capture every call
No need to modify gateway or API calls - just wrap once and go

Defense-in-depth: AI call executes FIRST, outside any Finault try/except.
Response captured, THEN Finault logic runs in separate try/except.
No Finault exception ever reaches developer code.
"""

import os
import time
import json
import asyncio
import hashlib
import atexit
from typing import Optional, Dict, Any, TypeVar, Generic, Callable
from functools import wraps
from datetime import datetime
import threading
from threading import Lock
import requests
from requests.adapters import Retry
from requests.packages.urllib3.util.retry import Retry as UrllibRetry

T = TypeVar('T')


class CostOverride:
    """Override cost for self-hosted models"""
    def __init__(self, amount: float, method: str = 'estimated'):
        self.amount = amount
        self.method = method


class EventBuffer:
    """Thread-safe event buffer with exponential backoff"""
    def __init__(self):
        self.events: list = []
        self.max_size = 1000
        self.lock = Lock()
        self.flush_in_progress = False
        self.backoff_ms = 100
        self.max_backoff_ms = 30000
        self.invalid_api_key_warned = False

    def push(self, event: Dict[str, Any]) -> None:
        """Add event to buffer (thread-safe)"""
        with self.lock:
            if len(self.events) >= self.max_size:
                self.events.pop(0)
            self.events.append(event)

    async def flush(self, api_key: str, endpoint: str) -> None:
        """Flush buffered events (async, with backoff)"""
        if self.flush_in_progress or not self.events:
            return

        self.flush_in_progress = True
        with self.lock:
            events_to_send = self.events[:]
            self.events = []

        try:
            await self._send_batch(events_to_send, api_key, endpoint)
            self.backoff_ms = 100  # Reset backoff on success
        except Exception:
            # Put events back in buffer for retry
            with self.lock:
                self.events = events_to_send + self.events
            # Increase backoff exponentially
            import random
            self.backoff_ms = min(
                self.backoff_ms * 2 + random.random() * 1000,
                self.max_backoff_ms
            )
        finally:
            self.flush_in_progress = False

    async def _send_batch(self, events: list, api_key: str, endpoint: str) -> None:
        """Send batch with 5s timeout"""
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    endpoint,
                    json={'receipts': events},
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'Content-Type': 'application/json'
                    },
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status >= 400:
                        raise Exception(f'HTTP {resp.status}')
        except asyncio.TimeoutError:
            print('[finault] batch upload timeout, events buffered for retry')
            raise
        except Exception as e:
            print(f'[finault] batch upload failed: {str(e)}')
            raise

    def mark_invalid_api_key(self) -> None:
        """Mark that invalid API key warning has been logged"""
        if not self.invalid_api_key_warned:
            self.invalid_api_key_warned = True

    def size(self) -> int:
        """Get current buffer size"""
        with self.lock:
            return len(self.events)


# Global event buffer
_global_buffer = EventBuffer()
_init_logged = False
_invalid_key_logged = False

# Top 20 LLM models with pricing (tokens per $1)
MODEL_PRICING = {
    # OpenAI - GPT-4 family
    'gpt-4': {'input_per_m': 0.03, 'output_per_m': 0.06},
    'gpt-4-turbo': {'input_per_m': 0.01, 'output_per_m': 0.03},
    'gpt-4o': {'input_per_m': 0.005, 'output_per_m': 0.015},
    'gpt-4-32k': {'input_per_m': 0.06, 'output_per_m': 0.12},

    # OpenAI - GPT-3.5 family
    'gpt-3.5-turbo': {'input_per_m': 0.0005, 'output_per_m': 0.0015},
    'gpt-3.5-turbo-16k': {'input_per_m': 0.001, 'output_per_m': 0.002},

    # Anthropic Claude family
    'claude-3-opus': {'input_per_m': 0.015, 'output_per_m': 0.075},
    'claude-3-sonnet': {'input_per_m': 0.003, 'output_per_m': 0.015},
    'claude-3-haiku': {'input_per_m': 0.00025, 'output_per_m': 0.00125},
    'claude-2.1': {'input_per_m': 0.008, 'output_per_m': 0.024},
    'claude-2': {'input_per_m': 0.008, 'output_per_m': 0.024},

    # Google Gemini family
    'gemini-pro': {'input_per_m': 0.0005, 'output_per_m': 0.0015},
    'gemini-pro-vision': {'input_per_m': 0.0005, 'output_per_m': 0.0015},
    'gemini-1.5-pro': {'input_per_m': 0.0035, 'output_per_m': 0.0106},

    # Meta Llama
    'llama-2-70b': {'input_per_m': 0.001, 'output_per_m': 0.001},
    'llama-2-13b': {'input_per_m': 0.00075, 'output_per_m': 0.0001},

    # Mistral
    'mistral-large': {'input_per_m': 0.002, 'output_per_m': 0.006},
    'mistral-medium': {'input_per_m': 0.00027, 'output_per_m': 0.00081},
    'mistral-small': {'input_per_m': 0.00014, 'output_per_m': 0.00042}
}


class WrapOptions:
    """Options for wrapping LLM clients"""
    def __init__(
        self,
        api_key: Optional[str] = None,
        track_revenue: bool = False,
        customer_id: Optional[str] = None,
        tags: Optional[Dict[str, str]] = None,
        telemetry_endpoint: str = 'https://api.finault.ai/v1/receipts/ingest'
    ):
        self.api_key = api_key or os.getenv('FINAULT_API_KEY')
        self.track_revenue = track_revenue
        self.customer_id = customer_id
        self.tags = tags or {}
        self.telemetry_endpoint = telemetry_endpoint

    def is_valid_api_key(self) -> bool:
        """Check if API key has valid format"""
        if not self.api_key:
            return False
        return self.api_key.startswith('fk_')


class FinaultWrapper:
    """Wraps any LLM client to auto-capture calls"""

    def __init__(self, client: Any, options: Optional[WrapOptions] = None):
        global _init_logged, _invalid_key_logged

        self._client = client
        self._options = options or WrapOptions()

        # Log initialization once
        if not _init_logged:
            _init_logged = True
            if self._options.api_key:
                print('[finault] connected, sealing enabled')
            else:
                print('[finault] no API key, pass-through mode')

        # Warn about invalid API key once
        if self._options.api_key and not self._options.is_valid_api_key():
            _global_buffer.mark_invalid_api_key()
            if not _invalid_key_logged:
                _invalid_key_logged = True
                print('[finault] invalid API key format, sealing skipped but AI calls succeed')

        # Register atexit auto-flush
        atexit.register(self._atexit_flush)

    def __getattr__(self, name: str) -> Any:
        """Proxy attribute access to the wrapped client"""
        attr = getattr(self._client, name)

        # If it's a method, wrap it
        if callable(attr):
            return self._create_wrapper(attr, name)

        # If it's an object with methods, return a proxy object
        if isinstance(attr, object) and hasattr(attr, '__dict__'):
            return NestedProxy(attr, self._options)

        return attr

    def _create_wrapper(self, method: Callable, method_name: str) -> Callable:
        """Create a wrapper for a method that records calls - DEFENSE IN DEPTH"""

        # Check if it's an async method
        if asyncio.iscoroutinefunction(method):
            @wraps(method)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                start_time = time.time()
                # Extract cost override if provided
                cost_override = kwargs.pop('finault_cost', None) if isinstance(kwargs, dict) else None

                # Step 1: Execute the AI call FIRST, outside any Finault try/except
                response = await method(*args, **kwargs)

                # Step 2: All Finault logic in completely separate try/except
                await self._record_call(response, args, kwargs, start_time, 'success', cost_override=cost_override)

                # Step 3: Return response regardless of what happened above
                return response

            return async_wrapper
        else:
            @wraps(method)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                start_time = time.time()
                # Extract cost override if provided
                cost_override = kwargs.pop('finault_cost', None) if isinstance(kwargs, dict) else None

                # Step 1: Execute AI call FIRST
                response = method(*args, **kwargs)

                # Check if it's an async generator
                if hasattr(response, '__aiter__'):
                    return self._wrap_async_generator(response, args, kwargs, start_time, cost_override)

                # Step 2: Record call in separate try/except (non-blocking)
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._record_call(response, args, kwargs, start_time, 'success', cost_override=cost_override))
                    else:
                        loop.run_until_complete(self._record_call(response, args, kwargs, start_time, 'success', cost_override=cost_override))
                except Exception:
                    # Silently fail - AI call already succeeded
                    pass

                # Step 3: Return response regardless
                return response

            return sync_wrapper

    async def _record_call(
        self,
        response: Any,
        args: tuple,
        kwargs: dict,
        start_time: float,
        status: str,
        error: Optional[Exception] = None,
        cost_override: Optional[CostOverride] = None
    ) -> None:
        """Record a call - DEFENSE IN DEPTH (all Finault logic in separate try/except)"""
        try:
            latency_ms = int((time.time() - start_time) * 1000)

            # Extract model and tokens from response
            request = args[0] if args else kwargs
            model = self._extract_model(request, response)
            tokens_in, tokens_out = self._extract_tokens(response)

            # Estimate or use override cost
            if cost_override:
                cost = cost_override.amount
            else:
                cost = self._estimate_cost(model, tokens_in, tokens_out)

            receipt = {
                'receipt_id': f"rcpt_wrap_{id(response)}",
                'who': {
                    'org_id': self._options.customer_id or 'unknown_org',
                    'customer_id': self._options.customer_id,
                    'user_id': self._options.tags.get('user_id', 'unknown_user')
                },
                'what': {
                    'model': model,
                    'provider': self._detect_provider(model, request, self._options.tags),
                    'tokens_in': tokens_in,
                    'tokens_out': tokens_out,
                    'latency_ms': latency_ms
                },
                'worth': {
                    'cost': cost,
                    'revenue': cost * 1.3 if self._options.track_revenue else None,
                    'margin': cost * 0.3 if self._options.track_revenue else None
                },
                'proof': {
                    'timestamp': datetime.utcnow().isoformat() + 'Z',
                    'receipt_hash': self._generate_receipt_hash(receipt)
                }
            }

            # Buffer for batch upload (thread-safe)
            if self._options.api_key and self._options.is_valid_api_key():
                _global_buffer.push(receipt)
                # Trigger async flush if not already in progress
                await _global_buffer.flush(self._options.api_key, self._options.telemetry_endpoint)
        except Exception as internal_error:
            # Caught in inner try/except. Logged internally. Never surfaces to developer.
            print(f'[finault] internal sealing error: {str(internal_error)}')

    async def _wrap_async_generator(self, generator: Any, args: tuple, kwargs: dict, start_time: float, cost_override: Optional[CostOverride] = None) -> Any:
        """Wrap async generator for streaming responses"""
        total_tokens = 0
        request = args[0] if args else kwargs
        model = self._extract_model(request, None)

        async for item in generator:
            if hasattr(item, 'usage') and hasattr(item.usage, 'completion_tokens'):
                total_tokens = item.usage.completion_tokens
            yield item

        # Record after streaming complete (Finault logic in separate try/except)
        await self._record_call(
            {'model': model, 'usage': {'prompt_tokens': 0, 'completion_tokens': total_tokens}},
            args, kwargs, start_time, 'success',
            cost_override=cost_override
        )

    @staticmethod
    def _extract_model(request: Any, response: Any) -> str:
        """Extract model name from request or response"""
        if isinstance(request, dict):
            return request.get('model', 'unknown')
        if hasattr(request, 'model'):
            return request.model
        if isinstance(response, dict):
            return response.get('model', 'unknown')
        if hasattr(response, 'model'):
            return response.model
        return 'unknown'

    @staticmethod
    def _extract_tokens(response: Any) -> tuple:
        """Extract token counts from response"""
        tokens_in = 0
        tokens_out = 0

        if isinstance(response, dict) and 'usage' in response:
            usage = response['usage']
            tokens_in = usage.get('prompt_tokens', 0)
            tokens_out = usage.get('completion_tokens', 0)
        elif hasattr(response, 'usage'):
            usage = response.usage
            if hasattr(usage, 'prompt_tokens'):
                tokens_in = usage.prompt_tokens
            if hasattr(usage, 'completion_tokens'):
                tokens_out = usage.completion_tokens

        return tokens_in, tokens_out

    @staticmethod
    def _estimate_cost(model: str, tokens_in: int, tokens_out: int, cost_override: Optional[CostOverride] = None) -> float:
        """Estimate cost from token counts and model, or use override for self-hosted"""
        if cost_override:
            return cost_override.amount

        pricing = MODEL_PRICING.get(model)
        if not pricing:
            # Fallback estimate for unknown models
            return (tokens_in * 0.001 + tokens_out * 0.002) / 1000

        return (tokens_in * pricing['input_per_m'] + tokens_out * pricing['output_per_m']) / 1_000_000

    @staticmethod
    def _detect_provider(model: str, request: Any = None, tags: Optional[Dict[str, str]] = None) -> str:
        """Detect provider from model name, tags, or request - supports self-hosted"""
        # Check for explicit provider override in tags
        if tags and tags.get('provider'):
            return tags['provider']

        # Auto-detect from model name
        if model.startswith('gpt-'):
            return 'openai'
        if model.startswith('claude-'):
            return 'anthropic'
        if model.startswith('gemini-'):
            return 'google'
        if model.startswith('llama-'):
            return 'meta'
        if model.startswith('mistral-'):
            return 'mistral'

        # Check request for provider
        if isinstance(request, dict) and request.get('model_provider'):
            return request['model_provider']
        if hasattr(request, 'model_provider'):
            return request.model_provider

        # Default for self-hosted or unknown
        return 'custom'

    @staticmethod
    def _generate_receipt_hash(receipt: Dict[str, Any]) -> str:
        """Generate receipt hash"""
        hash_input = json.dumps({
            'org_id': receipt['who']['org_id'],
            'model': receipt['what']['model'],
            'tokens_in': receipt['what']['tokens_in'],
            'tokens_out': receipt['what']['tokens_out'],
            'timestamp': receipt['proof']['timestamp']
        }, sort_keys=True)

        return 'sha256_' + hashlib.sha256(hash_input.encode()).hexdigest()[:16]

    def _atexit_flush(self) -> None:
        """atexit hook for automatic flush on shutdown"""
        if self._options.api_key:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_closed():
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                loop.run_until_complete(_global_buffer.flush(self._options.api_key, self._options.telemetry_endpoint))
            except Exception:
                pass  # Silently fail on shutdown


class NestedProxy:
    """Proxy for nested objects within wrapped client"""

    def __init__(self, obj: Any, options: WrapOptions):
        self._obj = obj
        self._options = options

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._obj, name)

        if callable(attr):
            wrapper = FinaultWrapper(self._obj, self._options)
            return wrapper._create_wrapper(attr, name)

        if isinstance(attr, object) and hasattr(attr, '__dict__'):
            return NestedProxy(attr, self._options)

        return attr


def wrap(client: T, options: Optional[WrapOptions] = None) -> T:
    """
    Wraps any LLM client to auto-capture every call and send receipts to Finault.

    Usage:
        from openai import OpenAI
        from finault.wrap import wrap

        openai = OpenAI(api_key='...')
        wrapped = wrap(openai, options=WrapOptions(api_key='fk_live_xxx'))
        response = wrapped.chat.completions.create(...)  # Auto-tracked!
    """
    return FinaultWrapper(client, options)


async def report_quality(
    seal_id: str,
    score: Optional[float] = None,
    method: str = 'explicit_score',
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Report quality for a seal.

    Args:
        seal_id: The seal ID to report quality for
        score: Quality score (0-1) or label ('good'/'acceptable'/'bad')
        method: Quality method (explicit_score, label, callback)
        metadata: Optional metadata

    Returns:
        Quality report response

    Usage:
        import finault
        await finault.report_quality(seal_id, score=0.85, method='explicit_score')
    """
    api_key = os.getenv('FINAULT_API_KEY')
    if not api_key:
        print('[finault] no API key, quality reporting skipped')
        return {'skipped': True}

    try:
        endpoint = os.getenv('FINAULT_ENDPOINT', 'https://api.finault.ai/v1')
        url = f"{endpoint}/seals/{seal_id}/quality"

        payload = {
            'quality': score,
            'method': method,
            'metadata': metadata or {}
        }

        response = requests.post(
            url,
            json=payload,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            },
            timeout=5
        )

        if response.status_code >= 400:
            raise Exception(f'HTTP {response.status_code}')

        return response.json()
    except Exception as e:
        print(f'[finault] quality report failed: {str(e)}')
        return {'error': str(e)}


async def flush() -> None:
    """
    Flush all buffered events to Finault.
    Useful for serverless cleanup (Lambda, Cloud Functions).

    Usage:
        import finault
        await finault.flush()
    """
    api_key = os.getenv('FINAULT_API_KEY')
    if api_key:
        endpoint = os.getenv('FINAULT_ENDPOINT', 'https://api.finault.ai/v1/receipts/ingest')
        await _global_buffer.flush(api_key, endpoint)
