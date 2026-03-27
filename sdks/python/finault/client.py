"""Main Finault API client"""

import time
import json
from typing import Dict, Any, Optional, Iterator, Union
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .version import __version__
from .exceptions import (
    FinaultError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    APIError,
)
from .resources import (
    Chat,
    ClosePack,
    Budgets,
    Anomalies,
    Keys,
    Dashboard,
    Health,
    Pricing,
)
from .agentgate import AgentGate
from .models import ChatCompletionChunk


class FinaultClient:
    """
    Official Finault SDK client for Python

    Usage:
        import finault
        client = finault.FinaultClient(api_key="fk_live_...")

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hello"}],
            provider_api_key="sk-..."
        )
        print(response.cost)
    """

    API_BASE_URL = "https://api.finault.ai"

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """
        Initialize the Finault client

        Args:
            api_key: Finault API key (starts with 'fk_')
            base_url: Optional custom API base URL
            timeout: Request timeout in seconds (default: 30)
            max_retries: Maximum number of retries for failed requests (default: 3)

        Raises:
            ValueError: If API key is not provided or invalid
        """
        if not api_key:
            raise ValueError("api_key is required")
        if not api_key.startswith("fk_"):
            raise ValueError("Invalid API key format. API keys should start with 'fk_'")

        self.api_key = api_key
        self.base_url = base_url or self.API_BASE_URL
        self.timeout = timeout
        self.max_retries = max_retries

        # Initialize HTTP session with retry strategy
        self.session = self._create_session()

        # Initialize resource groups
        self.chat = Chat(self)
        self.closepack = ClosePack(self)
        self.budgets = Budgets(self)
        self.anomalies = Anomalies(self)
        self.keys = Keys(self)
        self.dashboard = Dashboard(self)
        self.health = Health(self)
        self.pricing = Pricing(self)
        self.agentgate = AgentGate(self)

        # Outcome-based AI (lazy init to avoid circular import)
        self._outcomes = None

    @property
    def outcomes(self) -> "OutcomeClient":
        """Outcome-based AI — pay for results, not tokens."""
        if self._outcomes is None:
            self._outcomes = OutcomeClient(self)
        return self._outcomes

    def _create_session(self) -> requests.Session:
        """Create a requests session with retry strategy"""
        session = requests.Session()

        # Configure retry strategy for 429 and 5xx errors
        retry_strategy = Retry(
            total=self.max_retries,
            status_forcelist=[429, 500, 502, 503, 504],
            method_whitelist=["HEAD", "GET", "OPTIONS", "POST", "PUT", "DELETE"],
            backoff_factor=1,
        )

        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        return session

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers"""
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"finault-python/{__version__}",
        }

    def _handle_error_response(
        self, status_code: int, response_data: Dict[str, Any], request_id: Optional[str] = None
    ) -> None:
        """Handle error responses and raise appropriate exceptions"""
        error_message = response_data.get("error", {})
        if isinstance(error_message, dict):
            message = error_message.get("message", "Unknown error")
            code = error_message.get("code", "unknown")
        else:
            message = str(error_message)
            code = "unknown"

        if status_code == 401:
            raise AuthenticationError(message, status_code=status_code, request_id=request_id)
        elif status_code == 429:
            retry_after = int(response_data.get("retry_after", 60))
            raise RateLimitError(message, retry_after=retry_after, request_id=request_id)
        elif status_code == 400:
            field_errors = response_data.get("field_errors", {})
            raise ValidationError(message, field_errors=field_errors, request_id=request_id)
        elif status_code >= 500:
            raise APIError(
                f"Server error: {message}",
                status_code=status_code,
                error_code=code,
                request_id=request_id,
            )
        else:
            raise APIError(
                message,
                status_code=status_code,
                error_code=code,
                request_id=request_id,
            )

    def _request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make an API request

        Args:
            method: HTTP method (GET, POST, PUT, PATCH, DELETE)
            path: API endpoint path
            data: Request body data
            params: Query parameters

        Returns:
            Response JSON as dictionary

        Raises:
            FinaultError: For any API or network errors
        """
        url = f"{self.base_url}{path}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                headers=self._get_headers(),
                timeout=self.timeout,
            )

            request_id = response.headers.get("X-Request-Id")

            # Handle successful responses
            if response.status_code < 400:
                try:
                    return response.json()
                except json.JSONDecodeError:
                    if response.status_code == 204:
                        return {}
                    raise APIError("Invalid JSON response from API", request_id=request_id)

            # Handle error responses
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                response_data = {"error": {"message": response.text}}

            self._handle_error_response(response.status_code, response_data, request_id)

        except requests.exceptions.Timeout:
            raise APIError(f"Request timeout after {self.timeout}s")
        except requests.exceptions.ConnectionError as e:
            raise APIError(f"Connection error: {str(e)}")
        except requests.exceptions.RequestException as e:
            raise APIError(f"Request failed: {str(e)}")

    def _stream_request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Iterator[ChatCompletionChunk]:
        """
        Make a streaming API request

        Args:
            method: HTTP method
            path: API endpoint path
            data: Request body data

        Yields:
            ChatCompletionChunk objects

        Raises:
            FinaultError: For any API or network errors
        """
        url = f"{self.base_url}{path}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                headers=self._get_headers(),
                timeout=self.timeout,
                stream=True,
            )

            request_id = response.headers.get("X-Request-Id")

            if response.status_code >= 400:
                try:
                    response_data = response.json()
                except json.JSONDecodeError:
                    response_data = {"error": {"message": response.text}}
                self._handle_error_response(response.status_code, response_data, request_id)

            # Process streaming response
            for line in response.iter_lines():
                if not line:
                    continue

                line = line.decode("utf-8") if isinstance(line, bytes) else line

                # Skip SSE metadata
                if line.startswith(":"):
                    continue

                # Handle SSE data format
                if line.startswith("data: "):
                    line = line[6:]

                # End of stream
                if line == "[DONE]":
                    break

                try:
                    chunk_data = json.loads(line)
                    yield ChatCompletionChunk.from_dict(chunk_data)
                except json.JSONDecodeError:
                    # Skip malformed lines
                    continue

        except requests.exceptions.Timeout:
            raise APIError(f"Request timeout after {self.timeout}s")
        except requests.exceptions.ConnectionError as e:
            raise APIError(f"Connection error: {str(e)}")
        except requests.exceptions.RequestException as e:
            raise APIError(f"Request failed: {str(e)}")

    # ── finault.complete() — The One-Line Integration ─────────────────────────

    def complete(
        self,
        prompt: Union[str, list],
        *,
        customer_id: Optional[str] = None,
        feature: Optional[str] = None,
        team: Optional[str] = None,
        model: Optional[str] = None,
        margin_target: Optional[float] = None,
        quality_minimum: Optional[float] = None,
        max_cost: Optional[float] = None,
        budget_scope: Optional[str] = None,
        provider_api_key: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        tools: Optional[list] = None,
        stream: bool = False,
        allow_cross_provider: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Economically intelligent AI completion. One-line replacement for
        provider SDK calls. Finault handles model selection, provider routing,
        cost tracking, customer attribution, and margin calculation.

        This is the core Finault integration point. Replace:
            response = openai.chat.completions.create(model="gpt-4o", ...)
        With:
            response = finault.complete(prompt="...", customer_id="cust_abc123")

        Args:
            prompt: The prompt string or messages array.
                    If string, wrapped as [{"role": "user", "content": prompt}]
                    If list, used as-is (OpenAI messages format)

            customer_id: Customer this request serves (enables margin tracking)
            feature: Feature name triggering this request (e.g., "contract_review")
            team: Team/department responsible (e.g., "product", "support")

            model: Preferred model (e.g., "gpt-4o"). If omitted, Finault picks
                   the optimal model based on task + constraints.
            margin_target: Target gross margin (0.0-1.0). If set, Finault will
                          downgrade models to maintain this margin.
            quality_minimum: Minimum quality score (0-100). Prevents routing to
                            models below this threshold.
            max_cost: Maximum acceptable cost for this request in USD.
            budget_scope: Budget scope identifier (e.g., "customer:cust_abc123")

            provider_api_key: Provider API key (if not stored in Finault).
            temperature: Sampling temperature (0.0-2.0)
            max_tokens: Maximum tokens to generate
            top_p: Nucleus sampling parameter
            tools: Function calling tools array
            stream: Enable streaming response
            allow_cross_provider: Allow routing to a different provider
            metadata: Additional metadata to attach to this request

        Returns:
            Dict with keys:
                content: The AI response text
                model: The model that was actually used
                provider: The provider that served the request
                cost: Actual cost of this request in USD
                tokens: { input, output, total }
                routing: { original_model, reason, savings }
                margin: { current, projected, delta } (if customer_id set)
                budget: { remaining, utilization } (if budget tracked)
                request_id: Finault request ID for audit trail
        """
        # Normalize prompt into messages format
        if isinstance(prompt, str):
            messages = [{"role": "user", "content": prompt}]
        elif isinstance(prompt, list):
            messages = prompt
        else:
            raise ValueError("prompt must be a string or list of message dicts")

        # Build the request payload
        payload = {
            "messages": messages,
            "stream": stream,
            "economics": {
                "customer_id": customer_id,
                "feature": feature,
                "team": team,
                "margin_target": margin_target,
                "quality_minimum": quality_minimum,
                "max_cost": max_cost,
                "budget_scope": budget_scope,
                "allow_cross_provider": allow_cross_provider,
            },
        }

        if model:
            payload["model"] = model
        if provider_api_key:
            payload["provider_api_key"] = provider_api_key
        if temperature is not None:
            payload["temperature"] = temperature
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if top_p is not None:
            payload["top_p"] = top_p
        if tools:
            payload["tools"] = tools
        if metadata:
            payload["metadata"] = metadata

        # Remove None values from economics
        payload["economics"] = {
            k: v for k, v in payload["economics"].items() if v is not None
        }

        payload.update(kwargs)

        if stream:
            return self._stream_request("POST", "/v1/complete", payload)

        response = self._request("POST", "/v1/complete", payload)

        # Parse the response into a clean format
        return _parse_complete_response(response)

    def with_economics(
        self,
        *,
        customer_id: Optional[str] = None,
        feature: Optional[str] = None,
        team: Optional[str] = None,
        margin_target: Optional[float] = None,
        quality_minimum: Optional[float] = None,
        budget_remaining: Optional[float] = None,
    ) -> "EconomicContext":
        """
        Create an economic context for wrapping agent workflows.

        Usage:
            ctx = finault.with_economics(
                customer_id="cust_abc123",
                budget_remaining=4.50,
                margin_target=0.60,
                quality_minimum=0.85
            )

            # Every call through ctx carries economic awareness
            response = ctx.complete("Analyze this contract...")

        Returns:
            EconomicContext bound to these economic parameters
        """
        return EconomicContext(
            client=self,
            customer_id=customer_id,
            feature=feature,
            team=team,
            margin_target=margin_target,
            quality_minimum=quality_minimum,
            budget_remaining=budget_remaining,
        )

    # ── Economics & Cost Methods ──────────────────────────────────────────────────

    def cost(self, request_id: str) -> Dict[str, Any]:
        """
        Get detailed cost information for a specific request.

        Args:
            request_id: Finault request ID to look up

        Returns:
            Dict with cost breakdown and provider details
        """
        return self._request("GET", f"/v1/cost/{request_id}")

    def estimate_complexity(self, prompt: str, context_length: int = 0) -> Dict[str, Any]:
        """
        Score prompt complexity before execution.

        Analyzes a prompt to predict token usage and model requirements without
        actually executing the request. Useful for pre-routing decisions.

        Args:
            prompt: The prompt text to analyze
            context_length: Optional additional context length in tokens

        Returns:
            Dict with keys:
                complexity_score: 0-100 score
                estimated_tokens: Predicted token count
                recommended_models: List of suitable models
                estimated_cost: Estimated cost range
        """
        payload = {"prompt": prompt}
        if context_length > 0:
            payload["context_length"] = context_length
        return self._request("POST", "/v1/prompts/complexity", payload)

    def routing_recommendations(self, period: Optional[str] = None) -> Dict[str, Any]:
        """
        Get model routing optimization recommendations.

        Analyzes historical usage patterns and suggests model routing
        improvements to reduce cost while maintaining quality.

        Args:
            period: Optional period in YYYY-MM format (defaults to current month)

        Returns:
            Dict with:
                recommendations: List of routing suggestions
                potential_savings: Estimated monthly savings in USD
                quality_impact: Expected quality change from recommendations
        """
        params = {}
        if period:
            params["period"] = period
        return self._request("GET", "/v1/routing/recommendations", params=params)

    def reconcile(self, period: str, providers: Optional[list] = None) -> Dict[str, Any]:
        """
        Run batch cost reconciliation for a period.

        Reconciles Finault-tracked costs against actual provider billings
        for a specific period.

        Args:
            period: Period in YYYY-MM format (e.g., '2026-03')
            providers: Optional list of provider names to reconcile
                      (e.g., ['openai', 'anthropic'])

        Returns:
            Dict with:
                period: The period reconciled
                reconciliation_id: Unique ID for this reconciliation
                discrepancies: List of cost differences found
                total_finault_cost: Total tracked by Finault
                total_provider_cost: Total from provider bills
                variance_pct: Percentage difference
        """
        payload = {"period": period}
        if providers:
            payload["include_providers"] = providers
        return self._request("POST", "/v1/reconciliation/batch", payload)

    def user_economics(self, period: Optional[str] = None, limit: int = 50) -> Dict[str, Any]:
        """
        Get per-user cost attribution for internal teams.

        Returns cost breakdown by user, useful for team-level FinOps.

        Args:
            period: Optional period in YYYY-MM format
            limit: Maximum number of users to return (default: 50)

        Returns:
            Dict with:
                users: List of user cost records sorted by cost
                total_cost: Total cost across all users
                period: The period queried
        """
        params = {"limit": limit}
        if period:
            params["period"] = period
        return self._request("GET", "/v1/users/economics", params=params)

    def whales(self, period: Optional[str] = None, threshold_pct: int = 95) -> Dict[str, Any]:
        """
        Identify top cost users (whale alert).

        Returns the smallest set of users responsible for the specified
        percentage of total costs.

        Args:
            period: Optional period in YYYY-MM format
            threshold_pct: Cumulative cost threshold (default: 95 for top 95%)

        Returns:
            Dict with:
                whales: List of high-cost users
                cumulative_cost_pct: Actual cumulative percentage
                total_cost: Total cost for the period
                count: Number of users in the whale list
        """
        params = {"threshold_pct": threshold_pct}
        if period:
            params["period"] = period
        return self._request("GET", "/v1/users/whales", params=params)

    def features(self) -> Dict[str, Any]:
        """
        Get feature flags enabled for the organization.

        Returns information about which Finault features are available
        in the current organization plan.

        Returns:
            Dict with feature flags and their states
        """
        return self._request("GET", "/v1/features")

    def close(self) -> None:
        """Close the HTTP session"""
        self.session.close()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()

    def __repr__(self) -> str:
        return f"FinaultClient(api_key={self.api_key[:10]}..., base_url={self.base_url})"


# ─── Economic Context (for agent framework integration) ──────────────────────

class EconomicContext:
    """
    Wraps a FinaultClient with pre-set economic parameters.
    Every call through this context carries economic awareness.
    """

    def __init__(
        self,
        client: FinaultClient,
        customer_id: Optional[str] = None,
        feature: Optional[str] = None,
        team: Optional[str] = None,
        margin_target: Optional[float] = None,
        quality_minimum: Optional[float] = None,
        budget_remaining: Optional[float] = None,
    ):
        self._client = client
        self._customer_id = customer_id
        self._feature = feature
        self._team = team
        self._margin_target = margin_target
        self._quality_minimum = quality_minimum
        self._budget_remaining = budget_remaining
        self._total_spent = 0.0

    def complete(self, prompt, **kwargs):
        """Complete with economic context applied."""
        # Merge context defaults with per-call overrides
        merged = {
            "customer_id": kwargs.pop("customer_id", self._customer_id),
            "feature": kwargs.pop("feature", self._feature),
            "team": kwargs.pop("team", self._team),
            "margin_target": kwargs.pop("margin_target", self._margin_target),
            "quality_minimum": kwargs.pop("quality_minimum", self._quality_minimum),
        }

        # Budget enforcement: calculate remaining from initial budget
        if self._budget_remaining is not None:
            remaining = self._budget_remaining - self._total_spent
            merged["max_cost"] = min(
                kwargs.pop("max_cost", remaining),
                remaining,
            )

        result = self._client.complete(prompt, **merged, **kwargs)

        # Track spend
        if isinstance(result, dict) and "cost" in result:
            self._total_spent += result["cost"]

        return result

    @property
    def spent(self):
        """Total USD spent through this context."""
        return self._total_spent

    @property
    def budget_remaining(self):
        """Remaining budget in USD."""
        if self._budget_remaining is None:
            return None
        return max(0, self._budget_remaining - self._total_spent)

    def __repr__(self):
        budget_str = f", budget=${self._budget_remaining:.2f}" if self._budget_remaining else ""
        return f"EconomicContext(customer={self._customer_id}{budget_str}, spent=${self._total_spent:.4f})"


# ─── Response Parser ─────────────────────────────────────────────────────────

def _parse_complete_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """Parse the /v1/complete API response into a clean SDK format."""
    # The gateway returns an OpenAI-compatible response with Finault extensions
    choices = response.get("choices", [])
    content = ""
    if choices:
        message = choices[0].get("message", {})
        content = message.get("content", "")

    usage = response.get("usage", {})
    finault = response.get("finault", {})
    routing = finault.get("routing", {})
    economics = finault.get("economics", {})

    return {
        "content": content,
        "model": response.get("model", routing.get("selected_model", "unknown")),
        "provider": routing.get("provider", "unknown"),
        "cost": finault.get("cost", 0),
        "tokens": {
            "input": usage.get("prompt_tokens", 0),
            "output": usage.get("completion_tokens", 0),
            "total": usage.get("total_tokens", 0),
        },
        "routing": {
            "original_model": routing.get("original_model"),
            "reason": routing.get("reason", "direct"),
            "savings": routing.get("savings", 0),
            "task_type": routing.get("task_type"),
            "decision_time_us": routing.get("decision_time_us"),
        },
        "margin": economics.get("margin") if economics else None,
        "budget": economics.get("budget") if economics else None,
        "request_id": response.get("id") or finault.get("request_id"),
        "_raw": response,  # Full response for advanced use
    }


# ─── Outcome API ─────────────────────────────────────────────────────────────

class OutcomeClient:
    """
    Outcome-based AI — pay for results, not tokens.

    Usage:
        from finault import FinaultClient

        client = FinaultClient(api_key="fk_live_...")

        # Get a quote
        quote = client.outcomes.quote("review_contract", input=document)
        print(f"Price: ${quote['quoted_price']}")

        # Execute the outcome
        result = client.outcomes.execute(
            "review_contract",
            input=document,
            customer_id="cust_abc123",
        )
        print(result["content"])  # The reviewed contract
        print(f"Price: ${result['price']}")  # Fixed price, regardless of tokens
    """

    def __init__(self, client: FinaultClient):
        self._client = client

    def quote(
        self,
        task_type: str,
        *,
        input: Optional[Union[str, dict, list]] = None,
        budget: Optional[float] = None,
        quality: str = "standard",
    ) -> Dict[str, Any]:
        """
        Get a price quote for an outcome before committing.

        Args:
            task_type: The outcome type (e.g., 'review_contract', 'debug_function')
            input: The input data (used to assess complexity and price)
            budget: Maximum budget in USD
            quality: 'standard', 'high', or 'premium'

        Returns:
            Quote with: quoted_price, complexity, execution_plan, guaranteed
        """
        payload = {
            "task_type": task_type,
            "quality": quality,
        }
        if input is not None:
            payload["input"] = input if isinstance(input, str) else json.dumps(input)
        if budget is not None:
            payload["budget"] = budget

        return self._client._request("POST", "/v1/outcome/quote", payload)

    def execute(
        self,
        task_type: str,
        *,
        input: Union[str, dict, list],
        customer_id: Optional[str] = None,
        feature: Optional[str] = None,
        budget: Optional[float] = None,
        quality: str = "standard",
        metadata: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Execute an outcome. Pay a fixed price for a guaranteed result.

        This is the future of AI pricing. You define WHAT you want.
        Finault handles HOW — model selection, retries, quality checking.
        You pay for the outcome, not the tokens.

        Args:
            task_type: The outcome type (e.g., 'review_contract')
            input: The input data (document, code, text, etc.)
            customer_id: Customer this serves (for margin tracking)
            feature: Feature that triggered this (for attribution)
            budget: Max budget in USD (overrides catalog price)
            quality: 'standard', 'high', or 'premium'
            metadata: Additional metadata
            timeout: Custom timeout in seconds

        Returns:
            Dict with:
                content: The AI-generated result
                price: What you were charged (fixed)
                quality: Quality assessment of the result
                execution_id: Unique ID for this outcome execution
                duration_ms: How long it took
                attempts: How many model calls were needed
                models_used: Which models were used
        """
        payload = {
            "task_type": task_type,
            "input": input if isinstance(input, str) else json.dumps(input),
            "quality": quality,
        }
        if customer_id:
            payload["customer_id"] = customer_id
        if feature:
            payload["feature"] = feature
        if budget is not None:
            payload["budget"] = budget
        if metadata:
            payload["metadata"] = metadata

        response = self._client._request("POST", "/v1/outcome/execute", payload)
        return _parse_outcome_response(response)

    def list_types(self) -> list:
        """List all available outcome types with pricing."""
        return self._client._request("GET", "/v1/outcome/catalog")

    def register(
        self,
        task_type: str,
        *,
        display_name: str,
        base_price: float,
        system_prompt: str,
        quality_threshold: float = 0.85,
        max_retries: int = 3,
        preferred_models: Optional[list] = None,
        orchestration: Optional[dict] = None,
        description: str = "",
    ) -> Dict[str, Any]:
        """
        Register a custom outcome type for your organization.

        Args:
            task_type: Unique identifier (e.g., 'analyze_medical_record')
            display_name: Human-readable name
            base_price: Fixed price in USD
            system_prompt: The system prompt that defines what "good" looks like
            quality_threshold: Minimum quality score (0-1)
            max_retries: Max retry attempts
            preferred_models: Ordered list of preferred models
            orchestration: Orchestration config
            description: Description of what this outcome does

        Returns:
            The registered outcome configuration
        """
        payload = {
            "task_type": task_type,
            "display_name": display_name,
            "base_price": base_price,
            "system_prompt": system_prompt,
            "quality_threshold": quality_threshold,
            "max_retries": max_retries,
            "description": description,
        }
        if preferred_models:
            payload["preferred_models"] = preferred_models
        if orchestration:
            payload["orchestration"] = orchestration

        return self._client._request("POST", "/v1/outcome/register", payload)


def _parse_outcome_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """Parse outcome execution response."""
    return {
        "success": response.get("success", False),
        "content": response.get("content", ""),
        "price": response.get("price", 0),
        "actual_cost": response.get("actual_cost", 0),
        "margin_pct": response.get("margin_pct", 0),
        "quality": response.get("quality"),
        "met_quality_bar": response.get("met_quality_bar", False),
        "execution_id": response.get("execution_id"),
        "task_type": response.get("task_type"),
        "duration_ms": response.get("duration_ms", 0),
        "attempts": response.get("attempts", 0),
        "models_used": response.get("models_used", []),
        "total_tokens": response.get("total_tokens", 0),
        "result_summary": response.get("result_summary"),
        "_raw": response,
    }
