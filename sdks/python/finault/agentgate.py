"""AgentGate — AI Agent Economic Identity & Trust Layer for the Finault Python SDK"""

from typing import Dict, Any, Optional, List


class AgentGate:
    """
    AgentGate resource for managing AI agent identities, trust scores,
    and sealed transaction receipts via the Finault AIEI protocol.

    Usage:
        client = finault.FinaultClient(api_key="fk_live_...")
        agent = client.agentgate.register_agent(
            name="Acme Shopping Agent",
            rules={"spending_limit_daily": 200000},
            framework="langchain",
            model="claude-sonnet-4-20250514"
        )
        print(agent["credential"]["credential_hash"])
    """

    def __init__(self, client):
        self._client = client

    # ── Registration ──────────────────────────────────────────────────

    def register_agent(
        self,
        name: str,
        rules: Dict[str, Any],
        slug: Optional[str] = None,
        description: Optional[str] = None,
        framework: Optional[str] = None,
        model: Optional[str] = None,
        version: str = "1.0.0",
    ) -> Dict[str, Any]:
        """
        Register a new AI agent and receive an AIEI credential.

        Args:
            name: Human-readable agent name
            rules: Authorization rules dict with keys like:
                - spending_limit_per_tx (int, cents)
                - spending_limit_daily (int, cents)
                - spending_limit_monthly (int, cents)
                - permitted_categories (list of strings)
                - permitted_domains (list of strings)
                - delegation_depth (int)
                - geo_restrictions (list of ISO country codes)
            slug: URL-safe identifier (auto-generated from name if omitted)
            description: What this agent does
            framework: e.g. "langchain", "crewai", "autogen", "custom"
            model: e.g. "claude-sonnet-4-20250514", "gpt-4o"
            version: Agent version string

        Returns:
            Dict with agent_id, credential, and api_key_info
        """
        body = {
            "name": name,
            "rules": rules,
            "version": version,
        }
        if slug:
            body["slug"] = slug
        if description:
            body["description"] = description
        if framework:
            body["framework"] = framework
        if model:
            body["model"] = model

        return self._client._request("POST", "/v1/agents/register", data=body)

    # ── Verification ──────────────────────────────────────────────────

    def verify_agent(
        self,
        agent_id: str,
        action: Optional[str] = None,
        amount: Optional[int] = None,
        merchant: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Verify an agent's identity, trust score, and optional authorization.

        Args:
            agent_id: Agent UUID
            action: What the agent wants to do (e.g. "purchase")
            amount: Transaction amount in cents
            merchant: Merchant domain
            category: Merchant category

        Returns:
            Dict with verified, agent, trust_score, authorization, etc.
        """
        params = {}
        if action:
            params["action"] = action
        if amount is not None:
            params["amount"] = str(amount)
        if merchant:
            params["merchant"] = merchant
        if category:
            params["category"] = category

        return self._client._request(
            "GET", f"/v1/agents/{agent_id}/verify", params=params
        )

    # ── Receipts ──────────────────────────────────────────────────────

    def submit_receipt(
        self,
        agent_id: str,
        verification_id: str,
        action: str,
        merchant_id: str,
        worth: Dict[str, Any],
        status: str = "completed",
        merchant_name: Optional[str] = None,
        merchant_category: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Submit a sealed transaction receipt for an agent.

        Args:
            agent_id: Agent UUID
            verification_id: UUID from the verify call
            action: Action type (e.g. "purchase", "api_call")
            merchant_id: Who the agent transacted with
            worth: Dict with value_cents, currency, margin_impact_cents
            status: "completed", "failed", or "disputed"
            merchant_name: Human-readable merchant name
            merchant_category: MCC code or custom category
            metadata: Optional additional data

        Returns:
            Dict with receipt (id, aiei_proof, chain_position, etc.)
        """
        body: Dict[str, Any] = {
            "verification_id": verification_id,
            "action": action,
            "merchant_id": merchant_id,
            "worth": worth,
            "status": status,
        }
        if merchant_name:
            body["merchant_name"] = merchant_name
        if merchant_category:
            body["merchant_category"] = merchant_category
        if metadata:
            body["metadata"] = metadata

        return self._client._request(
            "POST", f"/v1/agents/{agent_id}/receipt", data=body
        )

    # ── Trust Score ───────────────────────────────────────────────────

    def get_score(self, agent_id: str) -> Dict[str, Any]:
        """
        Retrieve an agent's trust score and transaction stats.

        Args:
            agent_id: Agent UUID

        Returns:
            Dict with trust_score (composite, dimensions, percentile, trend)
            and stats (total_transactions, total_volume_usd, etc.)
        """
        return self._client._request("GET", f"/v1/agents/{agent_id}/score")

    # ── Pre-flight Authorization ──────────────────────────────────────

    def authorize_action(
        self,
        agent_id: str,
        action: str,
        amount_cents: int,
        merchant_domain: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Pre-flight authorization check — no receipt, no trust score update.

        Args:
            agent_id: Agent UUID
            action: What the agent wants to do
            amount_cents: Transaction amount in cents
            merchant_domain: Merchant domain to check
            category: Category to check

        Returns:
            Dict with authorized (bool) and reasons (list of rule checks)
        """
        body: Dict[str, Any] = {
            "action": action,
            "amount_cents": amount_cents,
        }
        if merchant_domain:
            body["merchant_domain"] = merchant_domain
        if category:
            body["category"] = category

        return self._client._request(
            "POST", f"/v1/agents/{agent_id}/authorize", data=body
        )

    # ── Public Credential ─────────────────────────────────────────────

    def get_credential(self, agent_id: str) -> Dict[str, Any]:
        """
        Retrieve an agent's public credential (no auth required).

        Args:
            agent_id: Agent UUID

        Returns:
            Dict with agent_id, name, credential_hash, public_key, etc.
        """
        # Use a special path that skips auth
        url = f"{self._client.base_url}/v1/agents/{agent_id}/credential"
        import requests as req

        resp = req.get(url, timeout=self._client.timeout)
        if resp.status_code < 400:
            return resp.json()

        self._client._handle_error_response(
            resp.status_code,
            resp.json() if resp.text else {"error": {"message": "Request failed"}},
        )

    # ── Agent Management ──────────────────────────────────────────────

    def list_agents(self) -> List[Dict[str, Any]]:
        """List all agents owned by the current API key owner."""
        return self._client._request("GET", "/v1/agents/register")

    def suspend_agent(self, agent_id: str) -> Dict[str, Any]:
        """Suspend an active agent."""
        return self._client._request(
            "PATCH", f"/v1/agents/{agent_id}", data={"status": "suspended"}
        )

    def revoke_agent(self, agent_id: str) -> Dict[str, Any]:
        """Permanently revoke an agent's credential."""
        return self._client._request(
            "PATCH", f"/v1/agents/{agent_id}", data={"status": "revoked"}
        )
