"""
Finault Python SDK
==================

Drop-in replacement for OpenAI and Anthropic clients.
Every call tagged, metered, and governed.

Usage:
    from finault import OpenAI, Anthropic
    
    # Instead of: from openai import OpenAI
    client = OpenAI(
        finault_key="fin_live_xxx",
        cost_center="ENG-001",
        project="chatbot",
        env="production"
    )
    
    # Use exactly like normal
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}]
    )
"""

import os
import httpx
from typing import Optional, Dict, Any, List
from dataclasses import dataclass


FINAULT_GATEWAY_URL = os.getenv("FINAULT_GATEWAY_URL", "https://finault-gateway-production.up.railway.app")


@dataclass
class FinaultConfig:
    """Configuration for Finault SDK"""
    gateway_url: str = FINAULT_GATEWAY_URL
    finault_key: Optional[str] = None
    cost_center: str = "default"
    project: str = "default"
    env: str = "development"
    owner: Optional[str] = None
    timeout: float = 60.0


class FinaultResponse:
    """Wrapper for API responses with Finault metadata"""
    
    def __init__(self, data: Dict[str, Any], headers: Dict[str, str]):
        self._data = data
        self.finault_request_id = headers.get("x-finault-request-id")
        self.finault_cost_cents = int(headers.get("x-finault-cost-cents", 0))
        self.finault_latency_ms = int(headers.get("x-finault-latency-ms", 0))
        self.finault_attestation = headers.get("x-finault-attestation")
        self.finault_provider = headers.get("x-finault-provider")
        self.finault_failover = headers.get("x-finault-failover") == "true"
    
    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._data.get(name)
    
    def __getitem__(self, key):
        return self._data[key]
    
    def to_dict(self) -> Dict[str, Any]:
        return self._data


class ChatCompletions:
    """OpenAI-compatible chat completions"""
    
    def __init__(self, client: "OpenAI"):
        self._client = client
    
    def create(
        self,
        model: str,
        messages: List[Dict[str, str]],
        **kwargs
    ) -> FinaultResponse:
        """Create a chat completion through Finault gateway"""
        return self._client._request(
            "POST",
            "/v1/openai/v1/chat/completions",
            json={"model": model, "messages": messages, **kwargs}
        )


class Chat:
    """OpenAI-compatible chat namespace"""
    
    def __init__(self, client: "OpenAI"):
        self.completions = ChatCompletions(client)


class OpenAI:
    """
    Finault-wrapped OpenAI client.
    
    Drop-in replacement for the official OpenAI client.
    All requests routed through Finault gateway for attribution.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        finault_key: Optional[str] = None,
        cost_center: str = "default",
        project: str = "default",
        env: str = "development",
        owner: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.config = FinaultConfig(
            gateway_url=base_url or FINAULT_GATEWAY_URL,
            finault_key=finault_key or os.getenv("FINAULT_KEY"),
            cost_center=cost_center or os.getenv("FINAULT_COST_CENTER", "default"),
            project=project or os.getenv("FINAULT_PROJECT", "default"),
            env=env or os.getenv("FINAULT_ENV", "development"),
            owner=owner or os.getenv("FINAULT_OWNER"),
            timeout=timeout
        )
        self.chat = Chat(self)
        self._client = httpx.Client(timeout=timeout)
    
    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "X-Finault-Cost-Center": self.config.cost_center,
            "X-Finault-Project": self.config.project,
            "X-Finault-Env": self.config.env,
        }
        
        if self.config.owner:
            headers["X-Finault-Owner"] = self.config.owner
        
        # Use Finault key if available, otherwise direct API key
        if self.config.finault_key:
            headers["Authorization"] = f"Bearer {self.config.finault_key}"
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        return headers
    
    def _request(self, method: str, path: str, **kwargs) -> FinaultResponse:
        url = f"{self.config.gateway_url}{path}"
        response = self._client.request(
            method,
            url,
            headers=self._get_headers(),
            **kwargs
        )
        response.raise_for_status()
        return FinaultResponse(response.json(), dict(response.headers))


class Messages:
    """Anthropic-compatible messages API"""
    
    def __init__(self, client: "Anthropic"):
        self._client = client
    
    def create(
        self,
        model: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 1024,
        **kwargs
    ) -> FinaultResponse:
        """Create a message through Finault gateway"""
        return self._client._request(
            "POST",
            "/v1/anthropic/v1/messages",
            json={"model": model, "messages": messages, "max_tokens": max_tokens, **kwargs}
        )


class Anthropic:
    """
    Finault-wrapped Anthropic client.
    
    Drop-in replacement for the official Anthropic client.
    All requests routed through Finault gateway for attribution.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        finault_key: Optional[str] = None,
        cost_center: str = "default",
        project: str = "default",
        env: str = "development",
        owner: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.config = FinaultConfig(
            gateway_url=base_url or FINAULT_GATEWAY_URL,
            finault_key=finault_key or os.getenv("FINAULT_KEY"),
            cost_center=cost_center or os.getenv("FINAULT_COST_CENTER", "default"),
            project=project or os.getenv("FINAULT_PROJECT", "default"),
            env=env or os.getenv("FINAULT_ENV", "development"),
            owner=owner or os.getenv("FINAULT_OWNER"),
            timeout=timeout
        )
        self.messages = Messages(self)
        self._client = httpx.Client(timeout=timeout)
    
    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "X-Finault-Cost-Center": self.config.cost_center,
            "X-Finault-Project": self.config.project,
            "X-Finault-Env": self.config.env,
        }
        
        if self.config.owner:
            headers["X-Finault-Owner"] = self.config.owner
        
        # Use Finault key if available, otherwise direct API key
        if self.config.finault_key:
            headers["X-Finault-Key"] = self.config.finault_key
        
        if self.api_key:
            headers["x-api-key"] = self.api_key
        
        return headers
    
    def _request(self, method: str, path: str, **kwargs) -> FinaultResponse:
        url = f"{self.config.gateway_url}{path}"
        response = self._client.request(
            method,
            url,
            headers=self._get_headers(),
            **kwargs
        )
        response.raise_for_status()
        return FinaultResponse(response.json(), dict(response.headers))


# =============================================================================
# MANAGEMENT API
# =============================================================================

class FinaultAdmin:
    """
    Finault Admin SDK for managing keys, budgets, quotas.
    """
    
    def __init__(
        self,
        admin_key: Optional[str] = None,
        base_url: Optional[str] = None
    ):
        self.admin_key = admin_key or os.getenv("FINAULT_ADMIN_KEY")
        self.base_url = base_url or FINAULT_GATEWAY_URL
        self._client = httpx.Client(timeout=30.0)
    
    def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        response = self._client.request(
            method,
            f"{self.base_url}{path}",
            headers={"Authorization": f"Bearer {self.admin_key}"},
            **kwargs
        )
        response.raise_for_status()
        return response.json()
    
    # Keys
    def create_key(
        self,
        name: str,
        provider: str,
        provider_key: str,
        cost_center: str,
        owner: str,
        project: Optional[str] = None,
        environment: str = "development",
        rate_limit_rpm: int = 60,
        expires_in_days: Optional[int] = None
    ) -> Dict[str, Any]:
        """Issue a new Finault API key"""
        return self._request("POST", "/v1/keys", json={
            "name": name,
            "provider": provider,
            "provider_key": provider_key,
            "cost_center": cost_center,
            "owner": owner,
            "project": project,
            "environment": environment,
            "rate_limit_rpm": rate_limit_rpm,
            "expires_in_days": expires_in_days
        })
    
    def list_keys(self) -> Dict[str, Any]:
        """List all API keys"""
        return self._request("GET", "/v1/keys")
    
    def rotate_key(self, key_id: str) -> Dict[str, Any]:
        """Rotate an API key"""
        return self._request("POST", f"/v1/keys/{key_id}/rotate")
    
    def revoke_key(self, key_id: str) -> Dict[str, Any]:
        """Revoke an API key"""
        return self._request("POST", f"/v1/keys/{key_id}/revoke")
    
    def get_orphaned_keys(self) -> Dict[str, Any]:
        """Get keys not used in 90 days"""
        return self._request("GET", "/v1/keys/orphaned")
    
    # Budgets
    def create_budget(
        self,
        cost_center: str,
        limit_cents: int,
        project: Optional[str] = None,
        period: str = "monthly",
        hard_cap: bool = True,
        alert_threshold_pct: int = 80
    ) -> Dict[str, Any]:
        """Create a budget"""
        return self._request("POST", "/v1/budgets", json={
            "cost_center": cost_center,
            "project": project,
            "limit_cents": limit_cents,
            "period": period,
            "hard_cap": hard_cap,
            "alert_threshold_pct": alert_threshold_pct
        })
    
    def list_budgets(self) -> Dict[str, Any]:
        """List all budgets with current spend"""
        return self._request("GET", "/v1/budgets")
    
    # Quotas
    def create_quota(
        self,
        cost_center: str,
        requests_per_minute: int,
        project: Optional[str] = None,
        environment: Optional[str] = None,
        tokens_per_minute: int = 100000,
        priority: int = 50
    ) -> Dict[str, Any]:
        """Create a quota"""
        return self._request("POST", "/v1/quotas", json={
            "cost_center": cost_center,
            "project": project,
            "environment": environment,
            "requests_per_minute": requests_per_minute,
            "tokens_per_minute": tokens_per_minute,
            "priority": priority
        })
    
    def list_quotas(self) -> Dict[str, Any]:
        """List all quotas"""
        return self._request("GET", "/v1/quotas")
    
    # Reporting
    def get_spend(
        self,
        group_by: str = "cost_center",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get spend report"""
        params = {"group_by": group_by}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._request("GET", "/v1/spend", params=params)
    
    def get_close_pack(self, format: str = "csv", date: Optional[str] = None) -> str:
        """Get Close Pack export"""
        params = {"format": format}
        if date:
            params["date"] = date
        response = self._client.get(
            f"{self.base_url}/v1/close-pack",
            params=params
        )
        return response.text
    
    # Circuit Breakers
    def get_circuit_breakers(self) -> Dict[str, Any]:
        """Get circuit breaker status"""
        return self._request("GET", "/v1/circuit-breakers")
    
    def reset_circuit_breaker(self, provider: str) -> Dict[str, Any]:
        """Reset a circuit breaker"""
        return self._request("POST", f"/v1/circuit-breakers/{provider}/reset")
    
    # Attestations
    def get_attestation(self, request_id: str) -> Dict[str, Any]:
        """Get attestation for a request"""
        return self._request("GET", f"/v1/attestations/{request_id}")
    
    def list_attestations(
        self,
        cost_center: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """List attestations"""
        params = {}
        if cost_center:
            params["cost_center"] = cost_center
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._request("GET", "/v1/attestations", params=params)
    
    # Health
    def health(self) -> Dict[str, Any]:
        """Get gateway health status"""
        return self._request("GET", "/v1/health")


# =============================================================================
# EXAMPLE USAGE
# =============================================================================

if __name__ == "__main__":
    # Example: Using Finault-wrapped OpenAI client
    print("=== Finault Python SDK ===\n")
    
    # Set up client
    client = OpenAI(
        api_key="sk-...",  # Your OpenAI key
        cost_center="ENG-001",
        project="sdk-test",
        env="development"
    )
    
    # Make a request (exactly like normal OpenAI SDK)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Hello!"}]
    )
    
    # Access response (exactly like normal)
    print(f"Response: {response.choices[0]['message']['content']}")
    
    # Plus Finault metadata
    print(f"Cost: {response.finault_cost_cents}¢")
    print(f"Latency: {response.finault_latency_ms}ms")
    print(f"Request ID: {response.finault_request_id}")
    print(f"Attestation: {response.finault_attestation}")
