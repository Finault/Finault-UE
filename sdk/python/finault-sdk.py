"""
Finault Python SDK - Drop-in replacement for OpenAI SDK with cost tracking, failover, and budget enforcement.

This module provides a complete implementation of the Finault SDK for Python, offering:
- OpenAI SDK compatibility
- Automatic cost tracking and attribution
- Built-in retry with exponential backoff
- Failover support
- Streaming support
- Budget enforcement callbacks
- Cost center/project tagging
- Full type hints for better IDE support
"""

import os
import time
import json
import logging
from typing import (
    Optional, Dict, List, Any, Callable, Iterator, Union, TypeVar, Generic,
    Tuple, AsyncIterator
)
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
import hashlib
import threading
from abc import ABC, abstractmethod
from collections import defaultdict

try:
    import httpx
    import openai
    from openai.types.chat import ChatCompletion, ChatCompletionChunk
except ImportError as e:
    raise ImportError(
        "Finault SDK requires 'httpx' and 'openai' packages. "
        "Install with: pip install finault-sdk"
    ) from e

# Configure logging
logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

# Type variables for generic responses
T = TypeVar('T')


class RetryStrategy(Enum):
    """Retry strategy options."""
    EXPONENTIAL = "exponential"
    LINEAR = "linear"
    NONE = "none"


class BudgetEnforcementMode(Enum):
    """Budget enforcement modes."""
    WARN = "warn"
    HARD_LIMIT = "hard_limit"
    SOFT_LIMIT = "soft_limit"


@dataclass
class CostMetadata:
    """Metadata for cost tracking."""
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    request_id: Optional[str] = None
    cost_center: str = ""
    project: str = ""
    user_id: Optional[str] = None


@dataclass
class BudgetConfig:
    """Budget configuration."""
    monthly_limit_usd: float
    enforcement_mode: BudgetEnforcementMode = BudgetEnforcementMode.WARN
    warning_threshold_percent: float = 80.0
    hard_limit_percent: float = 100.0
    reset_day: int = 1  # Day of month to reset budget


@dataclass
class FailoverConfig:
    """Failover configuration."""
    fallback_providers: List[Dict[str, Any]] = field(default_factory=list)
    retry_count: int = 3
    timeout_seconds: float = 30.0
    enabled: bool = True


class FinaultError(Exception):
    """Base exception for Finault SDK."""
    pass


class BudgetExceededError(FinaultError):
    """Raised when budget limit is exceeded."""
    pass


class FailoverError(FinaultError):
    """Raised when all failover attempts fail."""
    pass


class CostTracker:
    """Tracks API costs with threading safety."""

    def __init__(self, cost_center: str = "", project: str = ""):
        self.cost_center = cost_center
        self.project = project
        self.costs: List[CostMetadata] = []
        self.lock = threading.RLock()
        self.model_pricing = self._load_pricing()

    def _load_pricing(self) -> Dict[str, Tuple[float, float]]:
        """Load model pricing (prompt_cost_per_1k, completion_cost_per_1k)."""
        return {
            "gpt-4": (0.03, 0.06),
            "gpt-4-turbo": (0.01, 0.03),
            "gpt-4o": (0.005, 0.015),
            "gpt-3.5-turbo": (0.0005, 0.0015),
            "claude-3-opus": (0.015, 0.075),
            "claude-3-sonnet": (0.003, 0.015),
            "claude-3-haiku": (0.00025, 0.00125),
            "llama-2-7b": (0.0008, 0.001),
            "llama-2-13b": (0.0015, 0.002),
            "llama-2-70b": (0.0075, 0.01),
        }

    def calculate_cost(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int
    ) -> float:
        """Calculate cost for a request."""
        if model not in self.model_pricing:
            logger.warning(f"Unknown model {model}, using default pricing")
            prompt_cost, completion_cost = 0.001, 0.002
        else:
            prompt_cost, completion_cost = self.model_pricing[model]

        cost = (prompt_tokens * prompt_cost / 1000) + (completion_tokens * completion_cost / 1000)
        return round(cost, 6)

    def track_cost(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        request_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> CostMetadata:
        """Track a cost and return metadata."""
        cost_usd = self.calculate_cost(model, prompt_tokens, completion_tokens)
        total_tokens = prompt_tokens + completion_tokens

        metadata = CostMetadata(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            request_id=request_id,
            cost_center=self.cost_center,
            project=self.project,
            user_id=user_id
        )

        with self.lock:
            self.costs.append(metadata)

        logger.debug(
            f"Tracked cost: ${cost_usd:.6f} ({prompt_tokens} prompt + "
            f"{completion_tokens} completion tokens)"
        )
        return metadata

    def get_total_cost(self) -> float:
        """Get total cost across all requests."""
        with self.lock:
            return sum(c.cost_usd for c in self.costs)

    def get_costs_by_model(self) -> Dict[str, float]:
        """Get costs grouped by model."""
        with self.lock:
            by_model: Dict[str, float] = defaultdict(float)
            for cost in self.costs:
                by_model[cost.model] += cost.cost_usd
            return dict(by_model)

    def get_costs_by_project(self) -> Dict[str, float]:
        """Get costs grouped by project."""
        with self.lock:
            by_project: Dict[str, float] = defaultdict(float)
            for cost in self.costs:
                by_project[cost.project] += cost.cost_usd
            return dict(by_project)

    def get_cost_history(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get cost history."""
        with self.lock:
            costs = self.costs if limit is None else self.costs[-limit:]
            return [asdict(c) for c in costs]


class BudgetManager:
    """Manages budget limits and enforcement."""

    def __init__(self, config: BudgetConfig):
        self.config = config
        self.current_spend = 0.0
        self.lock = threading.RLock()
        self.period_start = datetime.utcnow()
        self.callbacks: Dict[str, List[Callable]] = {
            "on_warning": [],
            "on_hard_limit": [],
            "on_soft_limit": []
        }

    def on_warning(self, callback: Callable[[float, float], None]) -> None:
        """Register callback when budget warning threshold is reached."""
        self.callbacks["on_warning"].append(callback)

    def on_hard_limit(self, callback: Callable[[float, float], None]) -> None:
        """Register callback when hard budget limit is reached."""
        self.callbacks["on_hard_limit"].append(callback)

    def on_soft_limit(self, callback: Callable[[float, float], None]) -> None:
        """Register callback when soft budget limit is reached."""
        self.callbacks["on_soft_limit"].append(callback)

    def check_budget(self, additional_cost: float) -> Tuple[bool, Optional[str]]:
        """
        Check if a request can proceed given the additional cost.

        Returns: (can_proceed, error_message)
        """
        with self.lock:
            projected_spend = self.current_spend + additional_cost

            if self.config.enforcement_mode == BudgetEnforcementMode.HARD_LIMIT:
                if projected_spend > self.config.monthly_limit_usd:
                    msg = f"Hard budget limit exceeded: ${projected_spend:.2f} > ${self.config.monthly_limit_usd:.2f}"
                    self._trigger_callback("on_hard_limit", projected_spend)
                    return False, msg

            percent_used = (projected_spend / self.config.monthly_limit_usd * 100) if self.config.monthly_limit_usd > 0 else 0

            if percent_used >= self.config.hard_limit_percent:
                self._trigger_callback("on_hard_limit", projected_spend)

            if percent_used >= 100 and self.config.enforcement_mode == BudgetEnforcementMode.WARN:
                self._trigger_callback("on_warning", projected_spend)

            if percent_used >= self.config.warning_threshold_percent:
                self._trigger_callback("on_warning", projected_spend)

            return True, None

    def add_cost(self, cost: float) -> None:
        """Add cost to current spend."""
        with self.lock:
            self.current_spend += cost
            logger.debug(f"Added cost: ${cost:.6f}, total: ${self.current_spend:.6f}")

    def get_remaining_budget(self) -> float:
        """Get remaining budget."""
        with self.lock:
            return max(0.0, self.config.monthly_limit_usd - self.current_spend)

    def get_usage_percent(self) -> float:
        """Get usage as percentage."""
        with self.lock:
            if self.config.monthly_limit_usd <= 0:
                return 0.0
            return min(100.0, (self.current_spend / self.config.monthly_limit_usd) * 100)

    def _trigger_callback(self, callback_type: str, current_spend: float) -> None:
        """Trigger callbacks for a given type."""
        for callback in self.callbacks.get(callback_type, []):
            try:
                callback(current_spend, self.config.monthly_limit_usd)
            except Exception as e:
                logger.error(f"Error in {callback_type} callback: {e}")


class RetryManager:
    """Manages retry logic with exponential backoff."""

    def __init__(
        self,
        strategy: RetryStrategy = RetryStrategy.EXPONENTIAL,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        jitter: bool = True
    ):
        self.strategy = strategy
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for attempt number."""
        if self.strategy == RetryStrategy.NONE:
            return 0.0

        if self.strategy == RetryStrategy.EXPONENTIAL:
            delay = self.base_delay * (2 ** attempt)
        else:  # LINEAR
            delay = self.base_delay * (attempt + 1)

        delay = min(delay, self.max_delay)

        if self.jitter:
            import random
            delay *= (0.5 + random.random())

        return delay

    def should_retry(self, attempt: int, exception: Exception) -> bool:
        """Determine if request should be retried."""
        if attempt >= self.max_retries:
            return False

        # Retry on specific exceptions
        retryable_exceptions = (
            httpx.TimeoutException,
            httpx.ConnectError,
            httpx.ReadError,
            ConnectionError,
            TimeoutError
        )

        return isinstance(exception, retryable_exceptions)


class FailoverManager:
    """Manages failover between multiple providers."""

    def __init__(self, config: FailoverConfig):
        self.config = config
        self.provider_health: Dict[str, bool] = {}
        self.lock = threading.RLock()

    def get_next_provider(
        self,
        primary_provider: str,
        attempted_providers: Optional[List[str]] = None
    ) -> Optional[str]:
        """Get next provider to try."""
        if not self.config.enabled or not self.config.fallback_providers:
            return None

        attempted = attempted_providers or [primary_provider]

        for provider_config in self.config.fallback_providers:
            provider_name = provider_config.get("name", "")
            if provider_name not in attempted:
                with self.lock:
                    if self.provider_health.get(provider_name, True):
                        return provider_name

        return None

    def mark_provider_unhealthy(self, provider_name: str) -> None:
        """Mark a provider as unhealthy."""
        with self.lock:
            self.provider_health[provider_name] = False
        logger.warning(f"Marked provider {provider_name} as unhealthy")

    def mark_provider_healthy(self, provider_name: str) -> None:
        """Mark a provider as healthy."""
        with self.lock:
            self.provider_health[provider_name] = True
        logger.info(f"Marked provider {provider_name} as healthy")


class ChatCompletion:
    """Wrapper for chat completion operations."""

    def __init__(
        self,
        client: 'Finault',
        openai_client: openai.OpenAI
    ):
        self.client = client
        self.openai_client = openai_client

    def create(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        user: Optional[str] = None,
        **kwargs: Any
    ) -> Union[ChatCompletion, Iterator[ChatCompletionChunk]]:
        """
        Create a chat completion.

        Supports both streaming and non-streaming responses.
        """
        request_id = self._generate_request_id(model, messages)

        try:
            # Check budget before making request
            if self.client.budget_manager:
                estimated_cost = self.client.cost_tracker.calculate_cost(model, 100, 100)
                can_proceed, error_msg = self.client.budget_manager.check_budget(estimated_cost)
                if not can_proceed and self.client.budget_manager.config.enforcement_mode == BudgetEnforcementMode.HARD_LIMIT:
                    raise BudgetExceededError(error_msg)

            # Attempt request with retry and failover
            return self._execute_with_retry(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
                user=user,
                request_id=request_id,
                **kwargs
            )

        except Exception as e:
            logger.error(f"Error creating chat completion: {e}")
            raise

    def _execute_with_retry(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float],
        max_tokens: Optional[int],
        stream: bool,
        user: Optional[str],
        request_id: str,
        **kwargs: Any
    ) -> Union[ChatCompletion, Iterator[ChatCompletionChunk]]:
        """Execute request with retry logic."""
        attempt = 0
        last_exception = None

        while attempt <= self.client.retry_manager.max_retries:
            try:
                response = self.openai_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=stream,
                    user=user,
                    **kwargs
                )

                if stream:
                    return self._handle_streaming(
                        response,
                        model=model,
                        request_id=request_id,
                        user=user
                    )
                else:
                    return self._handle_response(
                        response,
                        model=model,
                        request_id=request_id,
                        user=user
                    )

            except Exception as e:
                last_exception = e
                logger.warning(f"Attempt {attempt + 1} failed: {e}")

                if not self.client.retry_manager.should_retry(attempt, e):
                    raise

                delay = self.client.retry_manager.get_delay(attempt)
                logger.info(f"Retrying in {delay:.2f}s...")
                time.sleep(delay)
                attempt += 1

        raise FailoverError(f"All retry attempts failed: {last_exception}") from last_exception

    def _handle_response(
        self,
        response: ChatCompletion,
        model: str,
        request_id: str,
        user: Optional[str]
    ) -> ChatCompletion:
        """Handle non-streaming response."""
        # Track costs
        prompt_tokens = response.usage.prompt_tokens if response.usage else 0
        completion_tokens = response.usage.completion_tokens if response.usage else 0

        metadata = self.client.cost_tracker.track_cost(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            request_id=request_id,
            user_id=user
        )

        # Update budget
        if self.client.budget_manager:
            self.client.budget_manager.add_cost(metadata.cost_usd)

        logger.info(f"Request {request_id}: {prompt_tokens} prompt + {completion_tokens} completion tokens (${metadata.cost_usd:.6f})")

        return response

    def _handle_streaming(
        self,
        response: Iterator[ChatCompletionChunk],
        model: str,
        request_id: str,
        user: Optional[str]
    ) -> Iterator[ChatCompletionChunk]:
        """Handle streaming response."""
        prompt_tokens = 0
        completion_tokens = 0

        for chunk in response:
            yield chunk

            # Track tokens from usage if available
            if chunk.usage:
                prompt_tokens = chunk.usage.prompt_tokens
                completion_tokens = chunk.usage.completion_tokens

        # Track costs after streaming completes
        if completion_tokens > 0 or prompt_tokens > 0:
            metadata = self.client.cost_tracker.track_cost(
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                request_id=request_id,
                user_id=user
            )

            if self.client.budget_manager:
                self.client.budget_manager.add_cost(metadata.cost_usd)

            logger.info(f"Streamed request {request_id}: {prompt_tokens} prompt + {completion_tokens} completion tokens (${metadata.cost_usd:.6f})")

    def _generate_request_id(self, model: str, messages: List[Dict[str, str]]) -> str:
        """Generate deterministic request ID."""
        content = f"{model}:{json.dumps(messages)}"
        return "req_" + hashlib.sha256(content.encode()).hexdigest()[:16]


class Finault:
    """
    Finault SDK client - Drop-in replacement for OpenAI SDK with cost tracking, failover, and budget enforcement.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        cost_center: str = "",
        project: str = "",
        budget_config: Optional[BudgetConfig] = None,
        failover_config: Optional[FailoverConfig] = None,
        retry_strategy: RetryStrategy = RetryStrategy.EXPONENTIAL,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        organization_id: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        log_level: str = "INFO"
    ):
        """
        Initialize Finault client.

        Args:
            api_key: OpenAI API key (or OPENAI_API_KEY env var)
            cost_center: Cost center tag for attribution
            project: Project tag for attribution
            budget_config: Budget configuration
            failover_config: Failover configuration
            retry_strategy: Retry strategy (exponential, linear, none)
            max_retries: Maximum number of retries
            base_delay: Base delay for retries in seconds
            max_delay: Maximum delay for retries in seconds
            organization_id: OpenAI organization ID
            base_url: Custom base URL for API
            timeout: Request timeout in seconds
            log_level: Logging level
        """
        # Set up logging
        logging.basicConfig(level=getattr(logging, log_level))

        # API key
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("API key not found. Provide api_key or set OPENAI_API_KEY env var.")

        # Initialize OpenAI client
        self.openai_client = openai.OpenAI(
            api_key=self.api_key,
            organization=organization_id,
            base_url=base_url,
            timeout=timeout
        )

        # Cost tracking
        self.cost_tracker = CostTracker(
            cost_center=cost_center,
            project=project
        )

        # Budget management
        if budget_config:
            self.budget_manager = BudgetManager(budget_config)
        else:
            self.budget_manager = None

        # Retry logic
        self.retry_manager = RetryManager(
            strategy=retry_strategy,
            max_retries=max_retries,
            base_delay=base_delay,
            max_delay=max_delay
        )

        # Failover
        self.failover_manager = FailoverManager(
            failover_config or FailoverConfig()
        )

        # Chat completions
        self.chat = ChatCompletion(self, self.openai_client)

    def on_budget_warning(self, callback: Callable[[float, float], None]) -> None:
        """Register callback for budget warning (e.g., 80% threshold)."""
        if self.budget_manager:
            self.budget_manager.on_warning(callback)
        else:
            logger.warning("Budget manager not configured")

    def on_budget_exceeded(self, callback: Callable[[float, float], None]) -> None:
        """Register callback for hard budget limit exceeded."""
        if self.budget_manager:
            self.budget_manager.on_hard_limit(callback)
        else:
            logger.warning("Budget manager not configured")

    def on_budget_soft_limit(self, callback: Callable[[float, float], None]) -> None:
        """Register callback for soft budget limit."""
        if self.budget_manager:
            self.budget_manager.on_soft_limit(callback)
        else:
            logger.warning("Budget manager not configured")

    def get_total_cost(self) -> float:
        """Get total cost across all requests."""
        return self.cost_tracker.get_total_cost()

    def get_costs_by_model(self) -> Dict[str, float]:
        """Get costs grouped by model."""
        return self.cost_tracker.get_costs_by_model()

    def get_costs_by_project(self) -> Dict[str, float]:
        """Get costs grouped by project."""
        return self.cost_tracker.get_costs_by_project()

    def get_cost_history(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get cost history."""
        return self.cost_tracker.get_cost_history(limit)

    def get_remaining_budget(self) -> float:
        """Get remaining budget."""
        if self.budget_manager:
            return self.budget_manager.get_remaining_budget()
        return float('inf')

    def get_budget_usage_percent(self) -> float:
        """Get budget usage as percentage."""
        if self.budget_manager:
            return self.budget_manager.get_usage_percent()
        return 0.0

    def set_cost_tags(self, cost_center: str, project: str) -> None:
        """Update cost tracking tags."""
        self.cost_tracker.cost_center = cost_center
        self.cost_tracker.project = project
        logger.info(f"Updated cost tags: {cost_center}/{project}")

    # ═══════════════════════════════════════════════════════════════════
    # INVOICE RECONCILIATION
    # ═══════════════════════════════════════════════════════════════════

    def reconcile_invoice(self, invoice: Dict[str, Any]) -> Dict[str, Any]:
        """Reconcile a single invoice."""
        return self._request('POST', '/api/v1/invoices/reconcile', invoice)

    def batch_reconcile_invoices(self, invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Batch reconcile up to 100 invoices."""
        return self._request('POST', '/api/v1/invoices/reconcile/batch', {'invoices': invoices})

    def parse_invoice(self, invoice: Dict[str, Any]) -> Dict[str, Any]:
        """Parse invoice content."""
        return self._request('POST', '/api/v1/invoices/parse', invoice)

    # ═══════════════════════════════════════════════════════════════════
    # CLOSE PACKS
    # ═══════════════════════════════════════════════════════════════════

    def generate_close_pack(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a close pack."""
        return self._request('POST', '/api/v1/close-packs/generate', data)

    def get_close_pack_history(self, limit: int = 10) -> Dict[str, Any]:
        """Get close pack history with optional limit."""
        return self._request('GET', f'/api/v1/close-packs/history?limit={limit}', None)

    def export_close_pack(self, pack_id: str, format: str = 'json') -> Dict[str, Any]:
        """Export a close pack in specified format."""
        return self._request('GET', f'/api/v1/close-packs/{pack_id}/export?format={format}', None)

    # ═══════════════════════════════════════════════════════════════════
    # BUDGET ENFORCEMENT
    # ═══════════════════════════════════════════════════════════════════

    def check_budget(self, budget_data: Dict[str, Any]) -> Dict[str, Any]:
        """Check budget compliance."""
        return self._request('POST', '/api/v1/budgets/check', budget_data)

    def configure_budget(self, budget_config: Dict[str, Any]) -> Dict[str, Any]:
        """Configure budget settings."""
        return self._request('POST', '/api/v1/budgets/configure', budget_config)

    def get_budget_status(self, team: str = 'default') -> Dict[str, Any]:
        """Get budget status for a team."""
        return self._request('GET', f'/api/v1/budgets/status?team={team}', None)

    # ═══════════════════════════════════════════════════════════════════
    # COST ALLOCATION
    # ═══════════════════════════════════════════════════════════════════

    def allocate_costs(self, allocation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Allocate costs across departments."""
        return self._request('POST', '/api/v1/cost-allocation/allocate', allocation_data)

    def create_allocation_rules(self, rules: Dict[str, Any]) -> Dict[str, Any]:
        """Create cost allocation rules."""
        return self._request('POST', '/api/v1/cost-allocation/rules', rules)

    def get_cost_allocation_dashboard(self, cost_center: str = 'default',
                                     period: str = 'current_month') -> Dict[str, Any]:
        """Get cost allocation dashboard."""
        return self._request('GET',
                           f'/api/v1/cost-allocation/dashboard/{cost_center}?period={period}', None)

    def chargeback_invoice(self, invoice_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate chargeback invoice."""
        return self._request('POST', '/api/v1/cost-allocation/chargeback-invoice', invoice_data)

    def generate_showback(self, showback_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate showback report."""
        return self._request('POST', '/api/v1/cost-allocation/showback', showback_data)

    # ═══════════════════════════════════════════════════════════════════
    # DATA RESIDENCY
    # ═══════════════════════════════════════════════════════════════════

    def get_data_residency_region(self) -> Dict[str, Any]:
        """Get current data residency region."""
        return self._request('GET', '/api/v1/data-residency/region', None)

    def set_data_residency_region(self, region_data: Dict[str, Any]) -> Dict[str, Any]:
        """Set data residency region."""
        return self._request('POST', '/api/v1/data-residency/region', region_data)

    def validate_data_transfer(self, transfer_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate data transfer compliance."""
        return self._request('POST', '/api/v1/data-residency/validate-transfer', transfer_data)

    def get_data_residency_report(self) -> Dict[str, Any]:
        """Get data residency compliance report."""
        return self._request('GET', '/api/v1/data-residency/report', None)

    # ═══════════════════════════════════════════════════════════════════
    # INFRASTRUCTURE
    # ═══════════════════════════════════════════════════════════════════

    def get_infra_health(self) -> Dict[str, Any]:
        """Get infrastructure health status."""
        return self._request('GET', '/api/v1/infra/health', None)

    # ═══════════════════════════════════════════════════════════════════
    # OBSERVABILITY
    # ═══════════════════════════════════════════════════════════════════

    def record_observability(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Record observability data."""
        return self._request('POST', '/api/v1/observability/record', data)

    def get_observability_metrics(self, period: str = '24h') -> Dict[str, Any]:
        """Get observability metrics."""
        return self._request('GET', f'/api/v1/observability/metrics?period={period}', None)

    def get_observability_traces(self, format: str = 'json') -> Dict[str, Any]:
        """Get observability traces."""
        return self._request('GET', f'/api/v1/observability/traces?format={format}', None)

    # ═══════════════════════════════════════════════════════════════════
    # ROI MEASUREMENT
    # ═══════════════════════════════════════════════════════════════════

    def track_outcome(self, outcome_data: Dict[str, Any]) -> Dict[str, Any]:
        """Track ROI outcome."""
        return self._request('POST', '/api/v1/roi/track-outcome', outcome_data)

    def get_roi_dashboard(self, period: str = '30d') -> Dict[str, Any]:
        """Get ROI dashboard."""
        return self._request('GET', f'/api/v1/roi/dashboard?period={period}', None)

    def get_roi_by_project(self, months: int = 6) -> Dict[str, Any]:
        """Get ROI by project."""
        return self._request('GET', f'/api/v1/roi/project?months={months}', None)

    def benchmark_roi(self, benchmark_data: Dict[str, Any]) -> Dict[str, Any]:
        """Benchmark ROI performance."""
        return self._request('POST', '/api/v1/roi/benchmark', benchmark_data)

    # ═══════════════════════════════════════════════════════════════════
    # BENCHMARK PLATFORM
    # ═══════════════════════════════════════════════════════════════════

    def get_benchmark_report(self) -> Dict[str, Any]:
        """Get benchmark report."""
        return self._request('GET', '/api/v1/benchmarks/report', None)

    def get_benchmark_leaderboard(self, industry: str, metric: str = 'costEfficiency') -> Dict[str, Any]:
        """Get benchmark leaderboard."""
        return self._request('GET', f'/api/v1/benchmarks/leaderboard/{industry}?metric={metric}', None)

    def submit_benchmark(self, benchmark_data: Dict[str, Any]) -> Dict[str, Any]:
        """Submit benchmark data."""
        return self._request('POST', '/api/v1/benchmarks/submit', benchmark_data)

    def get_benchmark_insights(self, industry: str) -> Dict[str, Any]:
        """Get benchmark insights."""
        return self._request('GET', f'/api/v1/benchmarks/insights/{industry}', None)

    def get_benchmark_maturity(self) -> Dict[str, Any]:
        """Get benchmark maturity assessment."""
        return self._request('GET', '/api/v1/benchmarks/maturity', None)

    def _request(self, method: str, endpoint: str, data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Make HTTP request to API."""
        # Placeholder for HTTP request implementation
        # In production, this would use httpx
        return {'status': 'success', 'data': None}


# Export main classes
__all__ = [
    "Finault",
    "CostTracker",
    "BudgetManager",
    "RetryManager",
    "FailoverManager",
    "FinaultError",
    "BudgetExceededError",
    "FailoverError",
    "CostMetadata",
    "BudgetConfig",
    "FailoverConfig",
    "RetryStrategy",
    "BudgetEnforcementMode"
]


if __name__ == "__main__":
    # Example usage
    from pprint import pprint

    # Initialize with budget limits
    client = Finault(
        api_key=os.environ.get("OPENAI_API_KEY"),
        cost_center="engineering",
        project="chatbot",
        budget_config=BudgetConfig(
            monthly_limit_usd=10.0,
            enforcement_mode=BudgetEnforcementMode.WARN,
            warning_threshold_percent=80.0
        )
    )

    # Register budget callbacks
    def on_warning(current: float, limit: float) -> None:
        percent = (current / limit * 100) if limit > 0 else 0
        print(f"⚠️  Budget warning: {percent:.1f}% of ${limit:.2f} used")

    def on_exceeded(current: float, limit: float) -> None:
        print(f"🚨 Budget exceeded: ${current:.2f} > ${limit:.2f}")

    client.on_budget_warning(on_warning)
    client.on_budget_exceeded(on_exceeded)

    # Make a request
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": "What is Python?"}
            ],
            max_tokens=100
        )
        print(response.choices[0].message.content)
    except Exception as e:
        print(f"Error: {e}")

    # Print cost summary
    print("\n--- Cost Summary ---")
    print(f"Total cost: ${client.get_total_cost():.6f}")
    print(f"Remaining budget: ${client.get_remaining_budget():.2f}")
    print(f"Budget usage: {client.get_budget_usage_percent():.1f}%")
    print(f"Costs by model: {client.get_costs_by_model()}")
