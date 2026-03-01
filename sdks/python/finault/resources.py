"""Resource classes for the Finault SDK"""

from typing import List, Dict, Any, Optional, Iterator
from .models import (
    ChatCompletion,
    ChatCompletionChunk,
    ClosePack,
    Budget,
    Anomaly,
    APIKey,
    DashboardOverview,
    DashboardInsights,
    HealthStatus,
    PricingInfo,
)


class Resource:
    """Base resource class"""

    def __init__(self, client):
        self._client = client


class Chat(Resource):
    """Chat resource for AI completions"""

    class Completions(Resource):
        """Chat completions endpoint"""

        def create(
            self,
            model: str,
            messages: List[Dict[str, str]],
            provider_api_key: str,
            stream: bool = False,
            temperature: Optional[float] = None,
            max_tokens: Optional[int] = None,
            top_p: Optional[float] = None,
            **kwargs,
        ) -> ChatCompletion:
            """
            Create a chat completion request

            Args:
                model: Model identifier (e.g., 'gpt-4o', 'claude-3-opus')
                messages: List of message dicts with 'role' and 'content'
                provider_api_key: The provider's API key (e.g., OpenAI API key)
                stream: Whether to stream the response
                temperature: Sampling temperature
                max_tokens: Maximum tokens to generate
                top_p: Nucleus sampling parameter

            Returns:
                ChatCompletion object with cost and usage information
            """
            payload = {
                "model": model,
                "messages": messages,
                "provider_api_key": provider_api_key,
                "stream": stream,
            }

            if temperature is not None:
                payload["temperature"] = temperature
            if max_tokens is not None:
                payload["max_tokens"] = max_tokens
            if top_p is not None:
                payload["top_p"] = top_p

            payload.update(kwargs)

            if stream:
                return self._client._stream_request(
                    "POST",
                    "/v1/chat/completions",
                    payload,
                )
            else:
                response = self._client._request(
                    "POST",
                    "/v1/chat/completions",
                    payload,
                )
                return ChatCompletion.from_dict(response)

    def __init__(self, client):
        super().__init__(client)
        self.completions = self.Completions(client)


class ClosePack(Resource):
    """Close pack resource for financial close operations"""

    def generate(self, period: str) -> ClosePack:
        """
        Generate a close pack for a specific period

        Args:
            period: Period in YYYY-MM format (e.g., '2026-02')

        Returns:
            ClosePack object with journal entries and summary
        """
        response = self._client._request(
            "POST",
            "/v1/closepack/generate",
            {"period": period},
        )
        return ClosePack.from_dict(response)

    def list(self, limit: int = 10, offset: int = 0) -> List[ClosePack]:
        """
        List close packs

        Args:
            limit: Number of results to return
            offset: Offset for pagination

        Returns:
            List of ClosePack objects
        """
        response = self._client._request(
            "GET",
            "/v1/closepack",
            params={"limit": limit, "offset": offset},
        )
        return [ClosePack.from_dict(item) for item in response.get("items", [])]


class Budgets(Resource):
    """Budget resource"""

    def create(
        self,
        name: str,
        limit: float,
        period: str = "monthly",
        alerts: Optional[List[Dict[str, Any]]] = None,
    ) -> Budget:
        """
        Create a new budget

        Args:
            name: Budget name
            limit: Spending limit amount
            period: Budget period ('daily', 'weekly', 'monthly', 'yearly')
            alerts: List of alert configurations

        Returns:
            Created Budget object
        """
        payload = {
            "name": name,
            "limit": limit,
            "period": period,
        }
        if alerts:
            payload["alerts"] = alerts

        response = self._client._request("POST", "/v1/budgets", payload)
        return Budget.from_dict(response)

    def list(self, status: Optional[str] = None) -> List[Budget]:
        """
        List all budgets

        Args:
            status: Filter by status ('active', 'paused', 'exceeded')

        Returns:
            List of Budget objects
        """
        params = {}
        if status:
            params["status"] = status

        response = self._client._request(
            "GET",
            "/v1/budgets",
            params=params,
        )
        return [Budget.from_dict(item) for item in response.get("items", [])]

    def get(self, budget_id: str) -> Budget:
        """
        Get a specific budget

        Args:
            budget_id: Budget ID

        Returns:
            Budget object
        """
        response = self._client._request("GET", f"/v1/budgets/{budget_id}")
        return Budget.from_dict(response)

    def update(
        self,
        budget_id: str,
        name: Optional[str] = None,
        limit: Optional[float] = None,
        status: Optional[str] = None,
    ) -> Budget:
        """
        Update a budget

        Args:
            budget_id: Budget ID
            name: New budget name
            limit: New spending limit
            status: New status

        Returns:
            Updated Budget object
        """
        payload = {}
        if name is not None:
            payload["name"] = name
        if limit is not None:
            payload["limit"] = limit
        if status is not None:
            payload["status"] = status

        response = self._client._request(
            "PATCH",
            f"/v1/budgets/{budget_id}",
            payload,
        )
        return Budget.from_dict(response)


class Anomalies(Resource):
    """Cost anomaly detection resource"""

    def list(
        self,
        severity: Optional[str] = None,
        acknowledged: Optional[bool] = None,
    ) -> List[Anomaly]:
        """
        List detected anomalies

        Args:
            severity: Filter by severity ('low', 'medium', 'high', 'critical')
            acknowledged: Filter by acknowledgement status

        Returns:
            List of Anomaly objects
        """
        params = {}
        if severity:
            params["severity"] = severity
        if acknowledged is not None:
            params["acknowledged"] = acknowledged

        response = self._client._request(
            "GET",
            "/v1/anomalies",
            params=params,
        )
        return [Anomaly.from_dict(item) for item in response.get("items", [])]

    def get(self, anomaly_id: str) -> Anomaly:
        """
        Get a specific anomaly

        Args:
            anomaly_id: Anomaly ID

        Returns:
            Anomaly object
        """
        response = self._client._request("GET", f"/v1/anomalies/{anomaly_id}")
        return Anomaly.from_dict(response)

    def acknowledge(self, anomaly_id: str) -> Anomaly:
        """
        Mark an anomaly as acknowledged

        Args:
            anomaly_id: Anomaly ID

        Returns:
            Updated Anomaly object
        """
        response = self._client._request(
            "POST",
            f"/v1/anomalies/{anomaly_id}/acknowledge",
        )
        return Anomaly.from_dict(response)


class Keys(Resource):
    """API key management resource"""

    def create(self, name: str) -> APIKey:
        """
        Create a new API key

        Args:
            name: Name for the API key

        Returns:
            New APIKey object (includes full key, only shown once)
        """
        response = self._client._request(
            "POST",
            "/v1/keys",
            {"name": name},
        )
        return APIKey.from_dict(response)

    def list(self) -> List[APIKey]:
        """
        List all API keys

        Returns:
            List of APIKey objects (key preview only, not full key)
        """
        response = self._client._request("GET", "/v1/keys")
        return [APIKey.from_dict(item) for item in response.get("items", [])]

    def revoke(self, key_id: str) -> None:
        """
        Revoke an API key

        Args:
            key_id: API key ID
        """
        self._client._request("DELETE", f"/v1/keys/{key_id}")


class Dashboard(Resource):
    """Dashboard metrics resource"""

    def overview(self) -> DashboardOverview:
        """
        Get dashboard overview with key metrics

        Returns:
            DashboardOverview object with spend, trends, and top models
        """
        response = self._client._request("GET", "/v1/dashboard/overview")
        return DashboardOverview.from_dict(response)

    def insights(self) -> DashboardInsights:
        """
        Get dashboard insights and recommendations

        Returns:
            DashboardInsights object with findings and recommendations
        """
        response = self._client._request("GET", "/v1/dashboard/insights")
        return DashboardInsights.from_dict(response)


class Health(Resource):
    """Health check resource"""

    def status(self) -> HealthStatus:
        """
        Check API health status

        Returns:
            HealthStatus object
        """
        response = self._client._request("GET", "/v1/health")
        return HealthStatus.from_dict(response)


class Pricing(Resource):
    """Pricing information resource"""

    def get(self) -> PricingInfo:
        """
        Get current pricing information

        Returns:
            PricingInfo object with model and provider pricing
        """
        response = self._client._request("GET", "/v1/pricing")
        return PricingInfo.from_dict(response)
