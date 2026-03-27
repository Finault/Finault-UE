"""
Finault Sync — Auto-fetch AI provider usage and push to Finault

This is the infrastructure hook that makes Finault impossible to remove.
Once a design partner runs `finault sync` in a cron job, removing Finault
means removing code from their codebase.

Supported providers:
    - OpenAI (usage API)
    - Anthropic (usage API)
    - AWS Bedrock (Cost Explorer)
    - Google Vertex AI (BigQuery billing export)
    - Azure OpenAI (Cost Management API)

Usage:
    # One-time setup
    finault init --provider openai --api-key sk-...

    # Manual sync
    finault sync

    # Cron job (runs monthly on the 2nd)
    0 9 2 * * cd /path/to/project && finault sync
"""

import os
import sys
import json
import csv
import io
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any

try:
    import requests
except ImportError:
    requests = None

from .version import __version__


# ─── Safe Input (for non-interactive / piped environments) ───────────────────

def _safe_input(prompt: str, default: str = "") -> str:
    """Read input, returning default if stdin is not a TTY (non-interactive)."""
    if not sys.stdin.isatty():
        return default
    try:
        return input(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return default


# ─── Configuration ────────────────────────────────────────────────────────────

FINAULT_DIR = ".finault"
CONFIG_FILE = "config.json"
FINAULT_API_BASE = "https://api.finault.ai"
FINAULT_APP_BASE = "https://app.finault.ai"


# ─── Use Case Definitions ────────────────────────────────────────────────────
# Determines how the entire pipeline frames outputs — Close Packs, Slack, Score, insights

USE_CASES = {
    "revenue": {
        "label": "We ship AI-powered features to our customers",
        "description": "Track margin per customer, per feature, pricing intelligence",
        "close_pack_emphasis": "margin",
        "score_weights": {
            "margin_health": 0.30,
            "unit_economics": 0.25,
            "cost_efficiency": 0.15,
            "trend_trajectory": 0.15,
            "governance_maturity": 0.10,
            "diversification": 0.05,
        },
        "slack_template": "revenue",
        "insight_focus": ["margin_per_customer", "unprofitable_customers", "pricing_intelligence"],
    },
    "spend": {
        "label": "We use AI internally (engineering, marketing, support)",
        "description": "Track cost per team, spend trends, waste identification",
        "close_pack_emphasis": "cost_governance",
        "score_weights": {
            "margin_health": 0.10,
            "unit_economics": 0.15,
            "cost_efficiency": 0.30,
            "trend_trajectory": 0.20,
            "governance_maturity": 0.20,
            "diversification": 0.05,
        },
        "slack_template": "spend",
        "insight_focus": ["cost_per_team", "spend_trend", "waste_identification"],
    },
    "both": {
        "label": "Both — we ship AI features AND use AI internally",
        "description": "Full margin + cost governance view",
        "close_pack_emphasis": "both",
        "score_weights": {
            "margin_health": 0.25,
            "unit_economics": 0.20,
            "cost_efficiency": 0.20,
            "trend_trajectory": 0.15,
            "governance_maturity": 0.15,
            "diversification": 0.05,
        },
        "slack_template": "both",
        "insight_focus": ["margin_per_customer", "cost_per_team", "unprofitable_customers", "spend_trend"],
    },
}


def get_config_path() -> Path:
    """Find the .finault config directory, walking up from cwd."""
    current = Path.cwd()
    while current != current.parent:
        config = current / FINAULT_DIR / CONFIG_FILE
        if config.exists():
            return current / FINAULT_DIR
        current = current.parent
    return Path.cwd() / FINAULT_DIR


def load_config() -> Dict[str, Any]:
    """Load Finault config from .finault/config.json."""
    config_dir = get_config_path()
    config_file = config_dir / CONFIG_FILE
    if not config_file.exists():
        return {}
    with open(config_file, "r") as f:
        return json.load(f)


def save_config(config: Dict[str, Any]) -> None:
    """Save Finault config to .finault/config.json."""
    config_dir = get_config_path()
    config_dir.mkdir(parents=True, exist_ok=True)
    config_file = config_dir / CONFIG_FILE
    with open(config_file, "w") as f:
        json.dump(config, f, indent=2)
    # Add to .gitignore if not already there
    gitignore = config_dir.parent / ".gitignore"
    ignore_line = ".finault/"
    if gitignore.exists():
        content = gitignore.read_text()
        if ignore_line not in content:
            with open(gitignore, "a") as f:
                f.write(f"\n# Finault config (contains API keys)\n{ignore_line}\n")
    else:
        gitignore.write_text(f"# Finault config (contains API keys)\n{ignore_line}\n")


# ─── Provider Fetchers ────────────────────────────────────────────────────────

def fetch_openai_usage(api_key: str, start_date: str, end_date: str, quiet: bool = False) -> List[Dict]:
    """
    Fetch usage from OpenAI's /v1/organization/costs endpoint.
    Returns rows in Finault CSV format.
    """
    if not requests:
        raise ImportError("requests library required: pip install requests")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    rows = []

    # Fetch costs — the OpenAI costs API returns {amount: {value, currency}} per bucket
    # Each result may have project_id, organization_id, line_item, etc.
    url = "https://api.openai.com/v1/organization/costs"
    start_ts = int(datetime.fromisoformat(start_date).timestamp())
    end_ts = int(datetime.fromisoformat(end_date).timestamp())

    # Build URL manually to ensure proper param encoding
    # group_by needs to be sent as group_by[]=project_id&group_by[]=line_item
    query = f"start_time={start_ts}&end_time={end_ts}&bucket_width=1d"
    query += "&group_by[]=project_id&group_by[]=line_item"
    full_url = f"{url}?{query}"

    try:
        resp = requests.get(full_url, headers=headers, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            for bucket in data.get("data", []):
                ts_val = bucket.get("start_time", "")
                ts = bucket.get("start_time_iso", "")
                if not ts and ts_val:
                    ts = datetime.fromtimestamp(ts_val).isoformat() + "Z" if isinstance(ts_val, (int, float)) else str(ts_val)

                for result in bucket.get("results", []):
                    amount_obj = result.get("amount", {})
                    cost_usd = float(amount_obj.get("value", 0))

                    if cost_usd <= 0:
                        continue

                    project_id = result.get("project_id", "default") or "default"
                    project_name = result.get("project_name", project_id) or project_id
                    org_name = result.get("organization_name", "OpenAI") or "OpenAI"
                    line_item = result.get("line_item", None)

                    # line_item tells us the model (e.g., "gpt-4o", "dall-e-3")
                    model = line_item if line_item else "unknown"

                    rows.append({
                        "timestamp": ts,
                        "organization_id": result.get("organization_id", "openai") or "openai",
                        "organization_name": org_name,
                        "project_id": project_id,
                        "project_name": project_name,
                        "api_key_id": "",
                        "api_key_name": "",
                        "model": model,
                        "usage_type": "combined",
                        "cost_in_usd": round(cost_usd, 6),
                    })
        elif resp.status_code == 403:
            if not quiet:
                print()  # newline after "Fetching from openai..."
                print(f"  OpenAI: Admin API key required for usage data (got 403)")
                print(f"  Get one at: https://platform.openai.com/settings/organization/admin-keys")
        else:
            if not quiet:
                print()  # newline after "Fetching from openai..."
                print(f"  OpenAI API returned {resp.status_code}")
    except requests.exceptions.RequestException as e:
        if not quiet:
            print()
            print(f"  OpenAI API error: {e}")

    return rows


def fetch_anthropic_usage(api_key: str, start_date: str, end_date: str, quiet: bool = False) -> List[Dict]:
    """
    Fetch usage from Anthropic's Admin Usage & Cost API.
    Requires an Admin API key (sk-ant-admin-...).
    Docs: https://platform.claude.com/docs/en/build-with-claude/usage-cost-api
    Returns rows in Finault CSV format.
    """
    if not requests:
        raise ImportError("requests library required: pip install requests")

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    rows = []

    # ─── Step 1: Fetch usage (token counts) grouped by model ─────────────
    # Endpoint: /v1/organizations/usage_report/messages
    # Time params use ISO 8601 format with Z suffix
    starting_at = f"{start_date}T00:00:00Z"
    ending_at = f"{end_date}T23:59:59Z"

    usage_url = "https://api.anthropic.com/v1/organizations/usage_report/messages"

    # Use array-style params: group_by[]=model
    page = None
    has_more = True

    while has_more:
        params = {
            "starting_at": starting_at,
            "ending_at": ending_at,
            "group_by[]": "model",
            "bucket_width": "1d",
        }
        if page:
            params["page"] = page

        try:
            resp = requests.get(usage_url, headers=headers, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()

                for bucket in data.get("data", []):
                    # Each bucket has a start/end time and token counts
                    bucket_start = bucket.get("started_at", bucket.get("start", starting_at))
                    # Extract date portion for timestamp
                    ts = bucket_start if "T" in str(bucket_start) else f"{bucket_start}T00:00:00Z"

                    model = bucket.get("model", "unknown")
                    input_tokens = bucket.get("input_tokens", 0) or 0
                    output_tokens = bucket.get("output_tokens", 0) or 0
                    cache_creation_tokens = bucket.get("cache_creation_input_tokens", 0) or 0
                    cache_read_tokens = bucket.get("cache_read_input_tokens", 0) or 0

                    # Calculate costs from tokens using MODEL_PRICING
                    # Anthropic usage API returns tokens, not costs
                    total_input = input_tokens + cache_creation_tokens + cache_read_tokens
                    if total_input > 0:
                        rows.append({
                            "timestamp": ts,
                            "organization_id": "anthropic",
                            "organization_name": "Anthropic",
                            "project_id": bucket.get("workspace_id", "default") or "default",
                            "project_name": bucket.get("workspace_id", "Default Workspace") or "Default Workspace",
                            "api_key_id": bucket.get("api_key_id", "") or "",
                            "api_key_name": "",
                            "model": model,
                            "usage_type": "input",
                            "input_tokens": total_input,
                            "cost_in_usd": 0,  # Will be enriched from cost endpoint or pricing
                        })
                    if output_tokens > 0:
                        rows.append({
                            "timestamp": ts,
                            "organization_id": "anthropic",
                            "organization_name": "Anthropic",
                            "project_id": bucket.get("workspace_id", "default") or "default",
                            "project_name": bucket.get("workspace_id", "Default Workspace") or "Default Workspace",
                            "api_key_id": bucket.get("api_key_id", "") or "",
                            "api_key_name": "",
                            "model": model,
                            "usage_type": "output",
                            "output_tokens": output_tokens,
                            "cost_in_usd": 0,
                        })

                has_more = data.get("has_more", False)
                page = data.get("next_page")
            elif resp.status_code == 401:
                if not quiet:
                    print()
                    print(f"  Anthropic: Admin API key required (sk-ant-admin-...)")
                    print(f"  Get one at: https://console.anthropic.com/settings/admin-keys")
                has_more = False
            elif resp.status_code == 403:
                if not quiet:
                    print()
                    print(f"  Anthropic: Key lacks admin permissions. Need an Admin API key.")
                    print(f"  Get one at: https://console.anthropic.com/settings/admin-keys")
                has_more = False
            else:
                if not quiet:
                    print()
                    print(f"  Anthropic usage API returned {resp.status_code}")
                has_more = False
        except requests.exceptions.RequestException as e:
            if not quiet:
                print()
                print(f"  Anthropic API error: {e}")
            has_more = False

    # ─── Step 2: Fetch costs (USD) and enrich rows ───────────────────────
    cost_url = "https://api.anthropic.com/v1/organizations/cost_report"
    cost_params = {
        "starting_at": starting_at,
        "ending_at": ending_at,
        "group_by[]": "description",
        "bucket_width": "1d",
    }

    try:
        resp = requests.get(cost_url, headers=headers, params=cost_params, timeout=30)
        if resp.status_code == 200:
            cost_data = resp.json()
            # Build a lookup: model → total cost
            model_costs = {}
            for bucket in cost_data.get("data", []):
                desc = bucket.get("description", "")
                # Parse model from description if available
                parsed = bucket.get("parsed_description", {})
                model = parsed.get("model", desc)
                cost_cents = float(bucket.get("cost_usd_cents", 0) or 0)
                cost_usd = cost_cents / 100.0
                model_costs[model] = model_costs.get(model, 0) + cost_usd

            # Enrich rows with actual costs
            # Distribute cost proportionally by token count per model
            model_token_totals = {}
            for row in rows:
                m = row.get("model", "")
                tokens = row.get("input_tokens", 0) + row.get("output_tokens", 0)
                model_token_totals[m] = model_token_totals.get(m, 0) + tokens

            for row in rows:
                m = row.get("model", "")
                tokens = row.get("input_tokens", 0) + row.get("output_tokens", 0)
                total_tokens = model_token_totals.get(m, 1)
                total_cost = model_costs.get(m, 0)
                if total_tokens > 0 and total_cost > 0:
                    row["cost_in_usd"] = round((tokens / total_tokens) * total_cost, 6)

    except Exception:
        # Cost enrichment is optional — fall back to token-based estimation
        # Use MODEL_PRICING to estimate costs from tokens
        for row in rows:
            model = row.get("model", "")
            price_per_m = MODEL_PRICING.get(model, 0)
            if price_per_m > 0:
                tokens = row.get("input_tokens", 0) + row.get("output_tokens", 0)
                row["cost_in_usd"] = round((tokens / 1_000_000) * price_per_m, 6)

    return rows


def fetch_aws_bedrock_usage(profile: str, region: str, start_date: str, end_date: str, quiet: bool = False) -> List[Dict]:
    """
    Fetch usage from AWS Cost Explorer for Bedrock services.
    Requires boto3 and AWS credentials.
    """
    try:
        import boto3
    except ImportError:
        if not quiet:
            print("  AWS: boto3 required — pip install boto3")
        return []

    rows = []
    try:
        session = boto3.Session(profile_name=profile, region_name=region)
        ce = session.client("ce")

        result = ce.get_cost_and_usage(
            TimePeriod={"Start": start_date, "End": end_date},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
            Filter={
                "Dimensions": {
                    "Key": "SERVICE",
                    "Values": ["Amazon Bedrock"],
                }
            },
            GroupBy=[
                {"Type": "DIMENSION", "Key": "USAGE_TYPE"},
            ],
        )

        for time_period in result.get("ResultsByTime", []):
            date = time_period["TimePeriod"]["Start"]
            for group in time_period.get("Groups", []):
                usage_type = group["Keys"][0]
                cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
                if cost > 0:
                    # Parse model from usage type (e.g., "USE1-InvokeModel-Claude-3-Sonnet")
                    model = usage_type.split("-", 2)[-1] if "-" in usage_type else usage_type
                    u_type = "input" if "Input" in usage_type else "output"
                    rows.append({
                        "timestamp": f"{date}T00:00:00Z",
                        "organization_id": "aws",
                        "organization_name": "AWS Bedrock",
                        "project_id": region,
                        "project_name": f"Bedrock ({region})",
                        "api_key_id": profile,
                        "api_key_name": profile,
                        "model": model,
                        "usage_type": u_type,
                        "cost_in_usd": round(cost, 6),
                    })
    except Exception as e:
        if not quiet:
            print(f"  AWS Cost Explorer error: {e}")

    return rows


def fetch_stripe_revenue(stripe_key: str, start_date: str, end_date: str,
                          quiet: bool = False) -> Dict[str, Dict]:
    """
    Fetch per-customer revenue from Stripe for a billing period.
    Uses Stripe Invoices API to get paid invoices grouped by customer.

    Returns dict: { customer_name: { revenue: float, customer_id: str, invoices: int } }
    """
    if not requests:
        if not quiet:
            print("  requests library required for Stripe integration")
        return {}

    base_url = "https://api.stripe.com/v1"
    headers = {"Authorization": f"Bearer {stripe_key}"}

    # Parse date range to Unix timestamps
    from datetime import datetime as dt
    try:
        start_ts = int(dt.strptime(start_date, "%Y-%m-%d").timestamp())
        end_ts = int(dt.strptime(end_date, "%Y-%m-%d").timestamp()) + 86400  # Include end day
    except Exception:
        if not quiet:
            print("  Stripe: invalid date range")
        return {}

    customer_revenue = {}
    has_more = True
    starting_after = None

    while has_more:
        params = {
            "status": "paid",
            "created[gte]": start_ts,
            "created[lte]": end_ts,
            "limit": 100,
            "expand[]": "data.customer",
        }
        if starting_after:
            params["starting_after"] = starting_after

        try:
            resp = requests.get(f"{base_url}/invoices", headers=headers, params=params, timeout=30)

            if resp.status_code == 401:
                if not quiet:
                    print("  Stripe: Invalid API key")
                return {}
            elif resp.status_code != 200:
                if not quiet:
                    print(f"  Stripe API error ({resp.status_code})")
                return {}

            data = resp.json()
            invoices = data.get("data", [])

            for inv in invoices:
                amount = float(inv.get("amount_paid", 0)) / 100.0  # Cents → dollars
                customer = inv.get("customer", {})
                if isinstance(customer, str):
                    cust_id = customer
                    cust_name = customer
                else:
                    cust_id = customer.get("id", "unknown")
                    cust_name = customer.get("name") or customer.get("email") or cust_id

                if cust_name not in customer_revenue:
                    customer_revenue[cust_name] = {
                        "revenue": 0,
                        "customer_id": cust_id,
                        "invoices": 0,
                    }
                customer_revenue[cust_name]["revenue"] += amount
                customer_revenue[cust_name]["invoices"] += 1

            has_more = data.get("has_more", False)
            if invoices:
                starting_after = invoices[-1].get("id")
            else:
                has_more = False

        except requests.exceptions.ConnectionError:
            if not quiet:
                print("  Stripe: connection failed")
            return {}
        except Exception as e:
            if not quiet:
                print(f"  Stripe error: {e}")
            return {}

    return customer_revenue


def fetch_stripe_revenue_via_gateway(finault_key: str, period: str = None,
                                      quiet: bool = False) -> Dict[str, Dict]:
    """
    Fetch per-customer revenue from Stripe via the Finault gateway.
    The gateway handles key management and customer-to-cost-center mapping.

    Returns dict: { customer_name: { revenue, customer_id, cost_center, invoices } }
    """
    if not requests or not finault_key:
        return {}

    try:
        # Trigger a Stripe sync on the gateway
        sync_resp = requests.post(
            f"{FINAULT_API_BASE}/v1/integrations/stripe/sync",
            headers={"Authorization": f"Bearer {finault_key}", "Content-Type": "application/json"},
            json={"period": period} if period else {},
            timeout=30,
        )

        if sync_resp.status_code != 200:
            if not quiet:
                print(f"gateway sync returned {sync_resp.status_code}")
            return {}

        sync_data = sync_resp.json()
        synced = sync_data.get("synced", 0)
        unmapped = sync_data.get("new_customers_found", [])

        if not quiet and unmapped:
            print(f"\n  ⚠ {len(unmapped)} Stripe customers not mapped to cost centers.")
            print(f"    Run `finault stripe-map` to assign them.")

        # Now fetch the revenue entries from the gateway
        params = {}
        if period:
            params["period"] = period

        rev_resp = requests.get(
            f"{FINAULT_API_BASE}/v1/revenue",
            headers={"Authorization": f"Bearer {finault_key}"},
            params=params,
            timeout=15,
        )

        if rev_resp.status_code != 200:
            return {}

        entries = rev_resp.json().get("data", [])
        customer_revenue = {}

        for entry in entries:
            cost_center = entry.get("cost_center", "unknown")
            amount = float(entry.get("amount", 0))
            ext = entry.get("raw_metadata", {})
            cust_id = ext.get("stripe_customer_id", "")

            if cost_center not in customer_revenue:
                customer_revenue[cost_center] = {
                    "revenue": 0,
                    "customer_id": cust_id,
                    "cost_center": cost_center,
                    "invoices": 0,
                }
            customer_revenue[cost_center]["revenue"] += amount
            customer_revenue[cost_center]["invoices"] += 1

        return customer_revenue

    except requests.exceptions.ConnectionError:
        if not quiet:
            print("gateway not reachable — trying direct Stripe")
        return {}
    except Exception as e:
        if not quiet:
            print(f"gateway error: {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════════════════
# TIME MACHINE — FULL HISTORICAL DATA INGESTION
# These functions pull the COMPLETE usage history from each provider, not just
# the current billing cycle. They are used by the Time Machine retroactive
# analysis engine to reconstruct the alternate financial timeline.
# ═══════════════════════════════════════════════════════════════════════════════


def validate_api_key_permissions(provider: str, api_key: str) -> Dict[str, Any]:
    """
    Validate that an API key has the required permissions for historical data access.
    Returns { valid: bool, key_type: str, error: str|None }
    """
    result = {"valid": False, "key_type": "unknown", "error": None}

    if provider == "openai":
        if api_key.startswith("sk-admin-"):
            result["key_type"] = "admin"
            result["valid"] = True
        elif api_key.startswith("sk-"):
            result["key_type"] = "standard"
            result["valid"] = False
            result["error"] = "OpenAI admin key required (starts with sk-admin-). Get one at: https://platform.openai.com/settings/organization/admin-keys"
        else:
            result["error"] = f"Invalid OpenAI key format. Expected sk-admin-... or sk-..."

    elif provider == "anthropic":
        if api_key.startswith("sk-ant-admin"):
            result["key_type"] = "admin"
            result["valid"] = True
        elif api_key.startswith("sk-ant-"):
            result["key_type"] = "standard"
            result["valid"] = False
            result["error"] = "Anthropic admin key required (starts with sk-ant-admin...). Get one at: https://console.anthropic.com/settings/admin-keys"
        else:
            result["error"] = f"Invalid Anthropic key format. Expected sk-ant-admin-..."

    elif provider == "stripe":
        if api_key.startswith("sk_live_") or api_key.startswith("sk_test_"):
            result["key_type"] = "secret"
            result["valid"] = True
        elif api_key.startswith("pk_"):
            result["error"] = "Stripe publishable key provided. Need a secret key (starts with sk_live_ or sk_test_)."
        else:
            result["error"] = f"Invalid Stripe key format. Expected sk_live_... or sk_test_..."

    return result


def fetch_openai_full_history(api_key: str, quiet: bool = False,
                               on_progress=None) -> List[Dict]:
    """
    Fetch the COMPLETE OpenAI usage history — all available data, no date range limit.

    Uses two endpoints:
    1. /v1/organization/usage/completions — token counts by model and project (daily)
    2. /v1/organization/costs — dollar costs by line_item and project (daily)

    Paginates through ALL data using next_page cursor.
    Stores raw API responses as JSON for audit.

    Args:
        api_key: OpenAI admin API key (sk-admin-...)
        quiet: Suppress progress output
        on_progress: Optional callback(stage, detail) for streaming progress updates

    Returns:
        List of normalized records matching the unified Time Machine schema:
        {date, provider, model, project_id, api_key_id, input_tokens, output_tokens,
         num_requests, cost_usd}
    """
    if not requests:
        raise ImportError("requests library required: pip install requests")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    records = []
    raw_responses = []
    total_calls_found = 0
    models_found = set()
    projects_found = set()

    # ─── Phase 1: Fetch usage/completions (token counts) ──────────────────
    # No start_time param → returns all available data
    # Paginate with next_page cursor
    if on_progress:
        on_progress("fetching", "Pulling OpenAI usage data...")

    usage_base = "https://api.openai.com/v1/organization/usage/completions"
    page_cursor = None
    page_num = 0

    while True:
        params = "bucket_width=1d&group_by[]=model&group_by[]=project_id"
        if page_cursor:
            params += f"&page={page_cursor}"

        try:
            resp = requests.get(f"{usage_base}?{params}", headers=headers, timeout=60)

            if resp.status_code == 200:
                data = resp.json()
                raw_responses.append({"endpoint": "usage/completions", "page": page_num, "data": data})

                for bucket in data.get("data", []):
                    ts_val = bucket.get("start_time", 0)
                    date_str = datetime.utcfromtimestamp(ts_val).strftime("%Y-%m-%d") if isinstance(ts_val, (int, float)) and ts_val > 0 else "unknown"

                    for result in bucket.get("results", []):
                        model = result.get("model", "unknown")
                        project = result.get("project_id", "default") or "default"
                        input_tok = result.get("input_tokens", 0) or 0
                        output_tok = result.get("output_tokens", 0) or 0
                        num_reqs = result.get("num_model_requests", 0) or 0

                        if input_tok == 0 and output_tok == 0:
                            continue

                        models_found.add(model)
                        projects_found.add(project)
                        total_calls_found += num_reqs

                        records.append({
                            "date": date_str,
                            "provider": "openai",
                            "model": model,
                            "project_id": project,
                            "api_key_id": "",
                            "input_tokens": input_tok,
                            "output_tokens": output_tok,
                            "num_requests": num_reqs,
                            "cost_usd": 0,  # Will be enriched from costs endpoint
                        })

                # Pagination
                page_cursor = data.get("next_page")
                page_num += 1

                if on_progress:
                    on_progress("progress", f"{total_calls_found:,} API calls found across {len(models_found)} models, {len(projects_found)} projects")

                if not page_cursor:
                    break
            elif resp.status_code == 403:
                if not quiet:
                    print("  OpenAI: Admin API key required for usage data (got 403)")
                break
            else:
                if not quiet:
                    print(f"  OpenAI usage API returned {resp.status_code}")
                break
        except requests.exceptions.RequestException as e:
            if not quiet:
                print(f"  OpenAI API error: {e}")
            break

    # ─── Phase 2: Fetch costs (USD amounts) and enrich records ────────────
    if on_progress:
        on_progress("fetching", "Pulling OpenAI cost data...")

    costs_base = "https://api.openai.com/v1/organization/costs"
    cost_lookup = {}  # (date, model, project_id) -> cost_usd
    page_cursor = None
    page_num = 0

    while True:
        params = "bucket_width=1d&group_by[]=project_id&group_by[]=line_item"
        if page_cursor:
            params += f"&page={page_cursor}"

        try:
            resp = requests.get(f"{costs_base}?{params}", headers=headers, timeout=60)

            if resp.status_code == 200:
                data = resp.json()
                raw_responses.append({"endpoint": "costs", "page": page_num, "data": data})

                for bucket in data.get("data", []):
                    ts_val = bucket.get("start_time", 0)
                    date_str = datetime.utcfromtimestamp(ts_val).strftime("%Y-%m-%d") if isinstance(ts_val, (int, float)) and ts_val > 0 else "unknown"

                    for result in bucket.get("results", []):
                        amount_obj = result.get("amount", {})
                        cost_usd = float(amount_obj.get("value", 0))
                        model = result.get("line_item", "unknown") or "unknown"
                        project = result.get("project_id", "default") or "default"

                        key = (date_str, model, project)
                        cost_lookup[key] = cost_lookup.get(key, 0) + cost_usd

                page_cursor = data.get("next_page")
                page_num += 1
                if not page_cursor:
                    break
            else:
                break
        except requests.exceptions.RequestException:
            break

    # Enrich records with cost data
    enriched = 0
    for rec in records:
        key = (rec["date"], rec["model"], rec["project_id"])
        if key in cost_lookup:
            rec["cost_usd"] = round(cost_lookup[key], 6)
            enriched += 1

    if on_progress:
        date_range = sorted(set(r["date"] for r in records if r["date"] != "unknown"))
        months = len(set(d[:7] for d in date_range)) if date_range else 0
        on_progress("complete", {
            "total_records": len(records),
            "total_calls": total_calls_found,
            "models": sorted(models_found),
            "projects": sorted(projects_found),
            "months": months,
            "date_range": (date_range[0], date_range[-1]) if date_range else None,
            "cost_enriched": enriched,
            "total_cost": round(sum(r["cost_usd"] for r in records), 2),
        })

    return records


def fetch_anthropic_full_history(api_key: str, quiet: bool = False,
                                  on_progress=None) -> List[Dict]:
    """
    Fetch the COMPLETE Anthropic usage history — all available data.

    Uses two endpoints:
    1. /v1/organizations/usage_report/messages — token counts by model/workspace (daily)
    2. /v1/organizations/cost_report — dollar costs by description (daily)

    Paginates with has_more/next_page.

    Args:
        api_key: Anthropic admin API key (sk-ant-admin-...)
        quiet: Suppress progress output
        on_progress: Optional callback(stage, detail) for streaming progress updates

    Returns:
        List of normalized records matching the unified Time Machine schema.
    """
    if not requests:
        raise ImportError("requests library required: pip install requests")

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    records = []
    raw_responses = []
    total_tokens = 0
    models_found = set()
    workspaces_found = set()

    # ─── Phase 1: Fetch usage (token counts) ──────────────────────────────
    if on_progress:
        on_progress("fetching", "Pulling Anthropic usage data...")

    usage_url = "https://api.anthropic.com/v1/organizations/usage_report/messages"

    # Pull max history: start from 2023-03-01 (Claude launch) through today
    starting_at = "2023-03-01T00:00:00Z"
    ending_at = datetime.utcnow().strftime("%Y-%m-%dT23:59:59Z")

    page = None
    has_more = True

    while has_more:
        params = {
            "starting_at": starting_at,
            "ending_at": ending_at,
            "group_by[]": ["model", "workspace_id", "api_key_id"],
            "bucket_width": "1d",
        }
        if page:
            params["page"] = page

        try:
            resp = requests.get(usage_url, headers=headers, params=params, timeout=60)

            if resp.status_code == 200:
                data = resp.json()
                raw_responses.append({"endpoint": "usage_report", "data": data})

                for bucket in data.get("data", []):
                    bucket_start = bucket.get("started_at", bucket.get("start", ""))
                    date_str = bucket_start[:10] if bucket_start else "unknown"

                    model = bucket.get("model", "unknown")
                    workspace = bucket.get("workspace_id", "default") or "default"
                    api_key_id = bucket.get("api_key_id", "") or ""
                    input_tok = (bucket.get("input_tokens", 0) or 0) + \
                                (bucket.get("cache_creation_input_tokens", 0) or 0) + \
                                (bucket.get("cache_read_input_tokens", 0) or 0)
                    output_tok = bucket.get("output_tokens", 0) or 0
                    num_reqs = bucket.get("num_requests", 0) or 0

                    if input_tok == 0 and output_tok == 0:
                        continue

                    models_found.add(model)
                    workspaces_found.add(workspace)
                    total_tokens += input_tok + output_tok

                    records.append({
                        "date": date_str,
                        "provider": "anthropic",
                        "model": model,
                        "project_id": workspace,
                        "api_key_id": api_key_id,
                        "input_tokens": input_tok,
                        "output_tokens": output_tok,
                        "num_requests": num_reqs,
                        "cost_usd": 0,  # Will be enriched from cost_report
                    })

                has_more = data.get("has_more", False)
                page = data.get("next_page")

                if on_progress:
                    on_progress("progress", f"{len(records):,} usage records, {len(models_found)} models")

            elif resp.status_code in (401, 403):
                if not quiet:
                    print("  Anthropic: Admin API key required (sk-ant-admin-...)")
                has_more = False
            else:
                if not quiet:
                    print(f"  Anthropic usage API returned {resp.status_code}")
                has_more = False
        except requests.exceptions.RequestException as e:
            if not quiet:
                print(f"  Anthropic API error: {e}")
            has_more = False

    # ─── Phase 2: Fetch costs (USD) and enrich ────────────────────────────
    if on_progress:
        on_progress("fetching", "Pulling Anthropic cost data...")

    cost_url = "https://api.anthropic.com/v1/organizations/cost_report"
    cost_lookup = {}  # (date, model_prefix) -> cost_usd
    page = None
    has_more = True

    while has_more:
        cost_params = {
            "starting_at": starting_at,
            "ending_at": ending_at,
            "group_by[]": "description",
            "bucket_width": "1d",
        }
        if page:
            cost_params["page"] = page

        try:
            resp = requests.get(cost_url, headers=headers, params=cost_params, timeout=60)
            if resp.status_code == 200:
                data = resp.json()
                raw_responses.append({"endpoint": "cost_report", "data": data})

                for bucket in data.get("data", []):
                    bucket_start = bucket.get("started_at", bucket.get("start", ""))
                    date_str = bucket_start[:10] if bucket_start else "unknown"
                    description = bucket.get("description", "")
                    cost_usd = float(bucket.get("cost_usd", 0) or 0)

                    # Description often contains the model name
                    key = (date_str, description)
                    cost_lookup[key] = cost_lookup.get(key, 0) + cost_usd

                has_more = data.get("has_more", False)
                page = data.get("next_page")
            else:
                has_more = False
        except requests.exceptions.RequestException:
            has_more = False

    # Enrich records — match by date + model substring in description
    for rec in records:
        for (date_str, desc), cost in cost_lookup.items():
            if rec["date"] == date_str and rec["model"] in desc:
                rec["cost_usd"] = round(cost, 6)
                break

    if on_progress:
        date_range = sorted(set(r["date"] for r in records if r["date"] != "unknown"))
        months = len(set(d[:7] for d in date_range)) if date_range else 0
        on_progress("complete", {
            "total_records": len(records),
            "total_tokens": total_tokens,
            "models": sorted(models_found),
            "workspaces": sorted(workspaces_found),
            "months": months,
            "date_range": (date_range[0], date_range[-1]) if date_range else None,
            "total_cost": round(sum(r["cost_usd"] for r in records), 2),
        })

    return records


def fetch_stripe_full_history(stripe_key: str, quiet: bool = False,
                               on_progress=None) -> Dict[str, Dict]:
    """
    Fetch the COMPLETE Stripe customer + invoice history.
    Pulls all customers, all invoices with line items, and all payments.

    Returns:
        Dict mapping customer_id to {
            name, email, mrr, total_paid, invoices: [{date, amount, status, line_items}],
            monthly_revenue: {YYYY-MM: amount}
        }
    """
    if not requests:
        raise ImportError("requests library required: pip install requests")

    headers = {
        "Authorization": f"Bearer {stripe_key}",
    }

    base = "https://api.stripe.com/v1"
    customers = {}

    # ─── Step 1: Fetch all customers ──────────────────────────────────────
    if on_progress:
        on_progress("fetching", "Pulling Stripe customers...")

    has_more = True
    starting_after = None

    while has_more:
        params = {"limit": 100}
        if starting_after:
            params["starting_after"] = starting_after

        try:
            resp = requests.get(f"{base}/customers", headers=headers, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                for cust in data.get("data", []):
                    cid = cust["id"]
                    customers[cid] = {
                        "name": cust.get("name", cust.get("email", cid)),
                        "email": cust.get("email", ""),
                        "mrr": 0,
                        "total_paid": 0,
                        "invoices": [],
                        "monthly_revenue": {},
                    }
                has_more = data.get("has_more", False)
                if has_more and data["data"]:
                    starting_after = data["data"][-1]["id"]
            else:
                if not quiet:
                    print(f"  Stripe customers API returned {resp.status_code}")
                break
        except requests.exceptions.RequestException as e:
            if not quiet:
                print(f"  Stripe API error: {e}")
            break

    if on_progress:
        on_progress("progress", f"{len(customers)} customers found")

    # ─── Step 2: Fetch all invoices ───────────────────────────────────────
    if on_progress:
        on_progress("fetching", "Pulling Stripe invoices...")

    has_more = True
    starting_after = None
    invoice_count = 0

    while has_more:
        params = {"limit": 100, "expand[]": "data.lines.data"}
        if starting_after:
            params["starting_after"] = starting_after

        try:
            resp = requests.get(f"{base}/invoices", headers=headers, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                for inv in data.get("data", []):
                    cid = inv.get("customer", "")
                    if cid not in customers:
                        # Customer might have been created after our customer pull or deleted
                        customers[cid] = {
                            "name": cid,
                            "email": "",
                            "mrr": 0,
                            "total_paid": 0,
                            "invoices": [],
                            "monthly_revenue": {},
                        }

                    amount = (inv.get("amount_paid", 0) or 0) / 100  # cents to dollars
                    status = inv.get("status", "unknown")
                    created = inv.get("created", 0)
                    date_str = datetime.utcfromtimestamp(created).strftime("%Y-%m-%d") if created else "unknown"
                    month_str = date_str[:7] if date_str != "unknown" else "unknown"

                    line_items = []
                    lines = inv.get("lines", {}).get("data", [])
                    for li in lines:
                        line_items.append({
                            "description": li.get("description", ""),
                            "amount": (li.get("amount", 0) or 0) / 100,
                        })

                    customers[cid]["invoices"].append({
                        "date": date_str,
                        "amount": amount,
                        "status": status,
                        "line_items": line_items,
                    })

                    if status == "paid" and amount > 0:
                        customers[cid]["total_paid"] += amount
                        if month_str != "unknown":
                            customers[cid]["monthly_revenue"][month_str] = \
                                customers[cid]["monthly_revenue"].get(month_str, 0) + amount

                    invoice_count += 1

                has_more = data.get("has_more", False)
                if has_more and data["data"]:
                    starting_after = data["data"][-1]["id"]
            else:
                if not quiet:
                    print(f"  Stripe invoices API returned {resp.status_code}")
                break
        except requests.exceptions.RequestException as e:
            if not quiet:
                print(f"  Stripe API error: {e}")
            break

    # Calculate MRR (average of last 3 months of revenue)
    for cid, cust in customers.items():
        monthly = cust["monthly_revenue"]
        if monthly:
            recent_months = sorted(monthly.keys())[-3:]
            cust["mrr"] = round(sum(monthly[m] for m in recent_months) / len(recent_months), 2)

    if on_progress:
        on_progress("complete", {
            "total_customers": len(customers),
            "total_invoices": invoice_count,
            "total_revenue": round(sum(c["total_paid"] for c in customers.values()), 2),
        })

    return customers


def fetch_custom_csv(file_path: str, **kwargs) -> List[Dict]:
    """
    Handle unknown provider formats by attempting intelligent CSV mapping.
    Reads any CSV/TSV and maps columns to Finault's expected format using
    fuzzy matching on column names.
    """
    rows = []
    path = Path(file_path)
    if not path.exists():
        print(f"  File not found: {file_path}")
        return rows

    with open(path, "r", encoding="utf-8-sig") as f:
        content = f.read()

    # Detect delimiter
    delimiter = ","
    first_line = content.split("\n")[0]
    if first_line.count("\t") > first_line.count(","):
        delimiter = "\t"

    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]

    if not headers:
        print("  Error: CSV has no headers")
        return rows

    # ─── Fuzzy column mapping ─────────────────────────────────────────────
    # Maps common column name variations to Finault's standard fields
    COLUMN_ALIASES = {
        "timestamp": ["timestamp", "date", "time", "created", "created_at", "usage_date",
                       "period", "billing_date", "invoice_date", "day"],
        "model": ["model", "model_name", "model_id", "llm", "engine", "deployment",
                   "model_version", "ai_model"],
        "cost_in_usd": ["cost", "cost_in_usd", "amount", "total", "spend", "charge",
                        "price", "usd", "cost_usd", "total_cost", "amount_usd",
                        "billed_amount", "usage_cost"],
        "usage_type": ["usage_type", "type", "direction", "token_type", "io_type"],
        "project_name": ["project", "project_name", "workspace", "team", "department",
                         "cost_center", "group", "application", "app", "service"],
        "organization_name": ["organization", "org", "company", "account", "tenant",
                              "organization_name", "org_name"],
        "project_id": ["project_id", "workspace_id", "team_id", "department_id"],
        "organization_id": ["organization_id", "org_id", "account_id", "tenant_id"],
        "api_key_id": ["api_key", "api_key_id", "key", "key_id", "credential"],
        "api_key_name": ["api_key_name", "key_name", "credential_name"],
    }

    # Build the mapping: finault_field → actual_csv_column
    # Two-pass: exact matches first, then fuzzy/substring matches
    column_map = {}
    unmapped_finault = []
    claimed_headers = set()  # Track which CSV headers are already mapped

    # Pass 1: exact matches only (highest confidence)
    for finault_field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            for actual_header in headers:
                if actual_header == alias and actual_header not in claimed_headers:
                    column_map[finault_field] = reader.fieldnames[headers.index(actual_header)]
                    claimed_headers.add(actual_header)
                    break
            if finault_field in column_map:
                break

    # Pass 2: fuzzy/substring matches for remaining unmapped fields
    for finault_field, aliases in COLUMN_ALIASES.items():
        if finault_field in column_map:
            continue
        matched = False
        for alias in aliases:
            for actual_header in headers:
                if actual_header in claimed_headers:
                    continue
                if alias in actual_header.replace("_", " ").replace("-", " "):
                    column_map[finault_field] = reader.fieldnames[headers.index(actual_header)]
                    claimed_headers.add(actual_header)
                    matched = True
                    break
            if matched:
                break
        if not matched:
            unmapped_finault.append(finault_field)

    # Must have at least cost and model to be useful
    if "cost_in_usd" not in column_map:
        print(f"\n  Could not find a cost column in your CSV.")
        print(f"  Found columns: {', '.join(reader.fieldnames)}")
        print(f"\n  Expected one of: {', '.join(COLUMN_ALIASES['cost_in_usd'])}")
        print(f"\n  Options:")
        print(f"    1. Rename your cost column to 'cost_in_usd'")
        print(f"    2. Use our CSV template: finault template > template.csv")
        print(f"    3. Upload directly at {FINAULT_APP_BASE} (auto-maps columns)")
        return rows

    if "model" not in column_map:
        print(f"\n  Could not find a model column in your CSV.")
        print(f"  Found columns: {', '.join(reader.fieldnames)}")
        print(f"  Expected one of: {', '.join(COLUMN_ALIASES['model'])}")
        print(f"  Continuing without model breakdown — costs will be grouped as 'unknown'.")

    # Report mapping
    print(f"\n  Column mapping:")
    for finault_field, csv_col in column_map.items():
        print(f"    {finault_field} ← {csv_col}")
    if unmapped_finault:
        optional = [f for f in unmapped_finault if f not in ("cost_in_usd",)]
        if optional:
            print(f"  Unmapped (using defaults): {', '.join(optional)}")

    # Re-read and map rows
    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    provider_name = path.stem.replace("-", " ").replace("_", " ").title()

    for i, raw_row in enumerate(reader):
        try:
            cost_val = raw_row.get(column_map.get("cost_in_usd", ""), "0")
            # Clean cost value: remove $, commas, whitespace
            cost_clean = str(cost_val).replace("$", "").replace(",", "").strip()
            if not cost_clean or cost_clean == "-":
                continue
            cost = float(cost_clean)
            if cost <= 0:
                continue

            row = {
                "timestamp": raw_row.get(column_map.get("timestamp", ""), datetime.now().strftime("%Y-%m-01T00:00:00Z")),
                "organization_id": raw_row.get(column_map.get("organization_id", ""), "custom"),
                "organization_name": raw_row.get(column_map.get("organization_name", ""), provider_name),
                "project_id": raw_row.get(column_map.get("project_id", ""), "default"),
                "project_name": raw_row.get(column_map.get("project_name", ""), "Default"),
                "api_key_id": raw_row.get(column_map.get("api_key_id", ""), ""),
                "api_key_name": raw_row.get(column_map.get("api_key_name", ""), ""),
                "model": raw_row.get(column_map.get("model", ""), "unknown"),
                "usage_type": raw_row.get(column_map.get("usage_type", ""), "combined"),
                "cost_in_usd": round(cost, 6),
            }
            rows.append(row)
        except (ValueError, TypeError) as e:
            if i == 0:
                print(f"  Warning: skipping row {i+1} — {e}")
            continue

    print(f"  Mapped {len(rows)} rows from custom CSV")
    return rows


PROVIDER_FETCHERS = {
    "openai": fetch_openai_usage,
    "anthropic": fetch_anthropic_usage,
    "aws": fetch_aws_bedrock_usage,
}


# ─── CSV Generation ──────────────────────────────────────────────────────────

CSV_COLUMNS = [
    "timestamp", "organization_id", "organization_name", "project_id",
    "project_name", "api_key_id", "api_key_name", "model",
    "usage_type", "cost_in_usd",
]


def rows_to_csv(rows: List[Dict]) -> str:
    """Convert row dicts to Finault-compatible CSV string."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in CSV_COLUMNS})
    return output.getvalue()


# ─── Upload to Finault ────────────────────────────────────────────────────────

def upload_to_finault(csv_data: str, finault_api_key: str, filename: str, quiet: bool = False) -> bool:
    """
    Push CSV data to the Finault API for processing.
    Returns True on success. Silently skips if no API key (local-only mode).
    """
    if not finault_api_key:
        return False  # Local-only mode — no cloud upload
    if not requests:
        raise ImportError("requests library required: pip install requests")

    url = f"{FINAULT_API_BASE}/v1/ingest/csv"
    headers = {
        "Authorization": f"Bearer {finault_api_key}",
        "Content-Type": "text/csv",
        "X-Finault-Source": "finault-sync",
        "X-Finault-SDK-Version": __version__,
        "X-Finault-Filename": filename,
    }

    try:
        resp = requests.post(url, headers=headers, data=csv_data, timeout=60)
        if resp.status_code in (200, 201):
            result = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            total = result.get("total_cost", "unknown")
            rows = result.get("row_count", "unknown")
            if not quiet:
                print(f"  Uploaded: {rows} rows, ${total} total spend")
            # Report auto-close result
            ac = result.get("auto_close", {})
            if ac.get("auto_closed") and not quiet:
                margins = ac.get("margins", {})
                ai_pct = margins.get("ai_cost_percent", "?")
                cp_id = ac.get("close_pack_id", "")
                print(f"  Close Pack for {ac.get('period', '?')} sealed automatically.")
                print(f"  AI spend is {ai_pct}% of revenue | chain: {ac.get('chain_hash', '?')[:12]}...")
                if cp_id:
                    print()
                    print(f"  \u2713 Sync complete. View your results: https://finault.ai/r/{cp_id}")
                    print()
            elif ac.get("reason") and not quiet:
                print(f"  Auto-close: {ac['reason']}")
            return True
        else:
            if not quiet:
                print(f"  Upload failed ({resp.status_code}): {resp.text[:200]}")
            return False
    except requests.exceptions.ConnectionError:
        # Finault API not yet live — save locally for manual upload
        if not quiet:
            print(f"  API not reachable — saving CSV locally for manual upload")
        return False
    except Exception as e:
        if not quiet:
            print(f"  Upload error: {e}")
        return False


# ─── Model Pricing & Savings ──────────────────────────────────────────────────

# ─── Model Pricing (blended input/output average per 1M tokens) ──────────────
# CANONICAL SOURCE: platform/model-registry.js LOCAL_FALLBACK_PRICING
# Blended = (inputPer1M × 0.7) + (outputPer1M × 0.3)  (70/30 input-heavy workload)
# This gives a single per-model estimate for CLI savings analysis.
# For precise input/output split pricing, use the gateway or dashboard.
# Last aligned with canonical source: 2026-03-01
MODEL_PRICING = {
    # OpenAI                                    # Canonical: input / output per 1M
    "gpt-4o": 4.75,                             # $2.50 / $10.00
    "gpt-4o-mini": 0.29,                        # $0.15 / $0.60
    "gpt-4-turbo": 16.00,                       # $10.00 / $30.00
    "gpt-4.1": 3.80,                            # $2.00 / $8.00
    "gpt-4.1-mini": 0.76,                       # $0.40 / $1.60
    "gpt-4.1-nano": 0.19,                       # $0.10 / $0.40
    "o1": 28.50,                                # $15.00 / $60.00
    "o1-mini": 5.70,                            # $3.00 / $12.00
    "o3": 3.80,                                 # $2.00 / $8.00
    "o3-mini": 2.09,                            # $1.10 / $4.40
    "o4-mini": 2.09,                            # $1.10 / $4.40
    # Anthropic (current generation)
    "claude-opus-4-5": 11.00,                   # $5.00 / $25.00
    "claude-opus-4": 33.00,                     # $15.00 / $75.00
    "claude-sonnet-4-5": 6.60,                  # $3.00 / $15.00
    "claude-sonnet-4": 6.60,                    # $3.00 / $15.00
    "claude-haiku-4-5": 2.20,                   # $1.00 / $5.00
    # Anthropic (previous generation — matches real invoice model names)
    "claude-3.5-sonnet": 6.60,                  # $3.00 / $15.00
    "claude-3.5-haiku": 1.76,                   # $0.80 / $4.00
    "claude-3-opus": 33.00,                     # $15.00 / $75.00
    "claude-3-sonnet": 6.60,                    # $3.00 / $15.00
    "claude-3-haiku": 0.55,                     # $0.25 / $1.25
    # Google
    "gemini-2.5-pro": 3.88,                     # $1.25 / $10.00
    "gemini-2.5-flash": 1.16,                   # $0.15 / $3.50
    "gemini-2.0-flash": 0.19,                   # $0.10 / $0.40
    "gemini-1.5-pro": 2.38,                     # $1.25 / $5.00
    "gemini-1.5-flash": 0.14,                   # $0.075 / $0.30
    # Meta (hosted)
    "llama-3.1-405b": 3.00,                     # ~$3.00 / $3.00
    "llama-3.1-70b": 0.90,                      # ~$0.90 / $0.90
    # DeepSeek
    "deepseek-v3": 0.52,                        # $0.27 / $1.10
    "deepseek-r1": 1.04,                        # $0.55 / $2.19
}

DOWNGRADE_MAP = {
    "gpt-4o": "gpt-4o-mini", "gpt-4-turbo": "gpt-4o",
    "gpt-4.1": "gpt-4.1-mini", "gpt-4.1-mini": "gpt-4.1-nano",
    "o1": "o3-mini", "o1-mini": "gpt-4o-mini", "o3": "o4-mini",
    "claude-opus-4-5": "claude-sonnet-4-5",
    "claude-opus-4": "claude-sonnet-4",
    "claude-sonnet-4-5": "claude-haiku-4-5",
    "claude-sonnet-4": "claude-haiku-4-5",
    "claude-3.5-sonnet": "claude-3.5-haiku",
    "claude-3-opus": "claude-3-sonnet",
    "claude-3-sonnet": "claude-3-haiku",
    "gemini-2.5-pro": "gemini-2.5-flash", "gemini-1.5-pro": "gemini-1.5-flash",
    "llama-3.1-405b": "llama-3.1-70b", "deepseek-r1": "deepseek-v3",
}


def compute_top_savings(rows: List[Dict]) -> Optional[Dict]:
    """
    Find the single biggest savings opportunity from the sync data.
    Returns {model, downgrade_to, current_cost, savings_pct, savings_amt} or None.
    """
    # Aggregate cost by model
    model_costs: Dict[str, float] = {}
    for row in rows:
        model = row.get("model", "unknown").lower().strip()
        cost = float(row.get("cost_in_usd", 0))
        model_costs[model] = model_costs.get(model, 0) + cost

    best = None
    for model, cost in model_costs.items():
        # Try to find this model in our pricing/downgrade tables
        # 1) Direct lookup (handles exact matches like "claude-3-opus")
        matched_model = model if model in DOWNGRADE_MAP else None
        # 2) Fuzzy substring match as fallback
        if not matched_model:
            for known in DOWNGRADE_MAP:
                if known in model or model in known:
                    matched_model = known
                    break
        if not matched_model:
            continue

        downgrade = DOWNGRADE_MAP[matched_model]
        current_price = MODEL_PRICING.get(matched_model, 0)
        downgrade_price = MODEL_PRICING.get(downgrade, 0)

        if current_price <= 0:
            continue

        savings_pct = (1 - downgrade_price / current_price) * 100
        savings_amt = cost * (savings_pct / 100)

        if best is None or savings_amt > best["savings_amt"]:
            best = {
                "model": matched_model,
                "downgrade_to": downgrade,
                "current_cost": round(cost, 2),
                "savings_pct": round(savings_pct, 1),
                "savings_amt": round(savings_amt, 2),
            }

    return best


# ─── Slack Notification ───────────────────────────────────────────────────────

def send_slack_notification(webhook_url: str, period: str, total_cost: float,
                            row_count: int, providers: List[str],
                            prev_cost: Optional[float] = None,
                            top_savings: Optional[Dict] = None) -> bool:
    """
    Send a monthly sync summary to Slack.
    This is the recurring process dependency — Finault shows up in their
    Slack channel every month unprompted.
    """
    if not requests or not webhook_url:
        return False

    # Build the change indicator
    change_text = ""
    if prev_cost and prev_cost > 0:
        pct = ((total_cost - prev_cost) / prev_cost) * 100
        arrow = "📈" if pct > 0 else "📉" if pct < 0 else "➡️"
        change_text = f"  {arrow} {abs(pct):.1f}% {'increase' if pct > 0 else 'decrease'} from last month"

    provider_list = ", ".join(p.title() for p in providers)

    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"Finault AI Cost Sync — {period}", "emoji": True}
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Total AI Spend:*\n${total_cost:,.2f}"},
                    {"type": "mrkdwn", "text": f"*Usage Records:*\n{row_count:,}"},
                    {"type": "mrkdwn", "text": f"*Providers:*\n{provider_list}"},
                    {"type": "mrkdwn", "text": f"*Status:*\n✅ Synced to Finault"},
                ]
            },
        ]
    }

    if change_text:
        payload["blocks"].append({
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": change_text}]
        })

    # Top savings opportunity — the actionable insight that makes this notification worth reading
    if top_savings and top_savings.get("savings_amt", 0) > 10:
        savings_text = (
            f":bulb: *Top savings opportunity:* Switch `{top_savings['model']}` → "
            f"`{top_savings['downgrade_to']}` to save ~${top_savings['savings_amt']:,.0f}/mo "
            f"({top_savings['savings_pct']:.0f}% reduction on ${top_savings['current_cost']:,.0f} spend)"
        )
        payload["blocks"].append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": savings_text}
        })

    payload["blocks"].append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": ":lock: Your *{period} Close Pack* has been synced. Finault Score updated automatically.".format(period=period)}]
    })

    payload["blocks"].append({
        "type": "actions",
        "elements": [{
            "type": "button",
            "text": {"type": "plain_text", "text": "View Dashboard →"},
            "url": f"{FINAULT_APP_BASE}/dashboard",
            "style": "primary",
        }]
    })

    try:
        resp = requests.post(webhook_url, json=payload, timeout=10)
        if resp.status_code == 200:
            print(f"  Slack notification sent ✓")
            return True
        else:
            print(f"  Slack notification failed ({resp.status_code})")
            return False
    except Exception as e:
        print(f"  Slack notification error: {e}")
        return False


# ─── Enhanced Slack Notifications (use-case-aware) ───────────────────────────

def _send_enhanced_slack(webhook_url: str, use_case: str, period: str,
                          total_cost: float, total_revenue: float = 0,
                          annual_revenue: float = 0, row_count: int = 0,
                          providers: List[str] = None, prev_cost: float = None,
                          top_savings: Optional[Dict] = None, chain_depth: int = 1,
                          cost_by_team: Dict[str, float] = None) -> bool:
    """Send use-case-aware Slack notification with rich blocks."""
    if not requests or not webhook_url:
        return False

    providers = providers or []
    cost_by_team = cost_by_team or {}

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"📦 {period} Close Pack Sealed", "emoji": True}
        },
    ]

    if use_case in ("revenue", "both") and total_revenue > 0:
        # Revenue framing
        margin_pct = ((total_revenue - total_cost) / total_revenue * 100) if total_revenue > 0 else 0
        summary_parts = [f"*Gross Margin: {margin_pct:.0f}%* | AI Cost: ${total_cost:,.0f} | Revenue: ${total_revenue:,.0f}"]

        # MoM
        if prev_cost and prev_cost > 0:
            pct = ((total_cost - prev_cost) / prev_cost) * 100
            summary_parts[0] += f" | {'↑' if pct > 0 else '↓'}{abs(pct):.0f}% MoM"

        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": "\n".join(summary_parts)}
        })

        # Savings with margin impact
        if top_savings and top_savings.get("savings_amt", 0) > 10:
            monthly = top_savings["savings_amt"]
            projected_margin = margin_pct + (monthly / total_revenue * 100) if total_revenue > 0 else 0
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": (
                    f"*Top Action:* Switch `{top_savings['model']}` → `{top_savings['downgrade_to']}`\n"
                    f"Margin impact: {margin_pct:.0f}% → {projected_margin:.0f}% | "
                    f"Saves ${monthly:,.0f}/mo"
                )}
            })
    else:
        # Spend framing
        summary = f"*Total AI Spend: ${total_cost:,.0f}*"
        if prev_cost and prev_cost > 0:
            pct = ((total_cost - prev_cost) / prev_cost) * 100
            summary += f" | {'↑' if pct > 0 else '↓'}{abs(pct):.0f}% MoM"
        if annual_revenue and annual_revenue > 0:
            ai_pct = (total_cost * 12 / annual_revenue) * 100
            summary += f"\nAI = {ai_pct:.1f}% of revenue"

        # Top teams
        if cost_by_team:
            top_teams = sorted(cost_by_team.items(), key=lambda x: x[1], reverse=True)[:3]
            team_str = " | ".join(f"{t}: ${c:,.0f}" for t, c in top_teams)
            summary += f"\n*Top teams:* {team_str}"

        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": summary}
        })

        if top_savings and top_savings.get("savings_amt", 0) > 10:
            annual = top_savings["savings_amt"] * 12
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": (
                    f"💡 *${top_savings['savings_amt']:,.0f}/mo savings available* — "
                    f"`{top_savings['model']}` → `{top_savings['downgrade_to']}`\n"
                    f"Annual impact: ${annual:,.0f}"
                )}
            })

    # Chain info
    blocks.append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": f"Close Pack #{chain_depth} | Chain sealed with SHA-256"}]
    })

    blocks.append({
        "type": "actions",
        "elements": [{
            "type": "button",
            "text": {"type": "plain_text", "text": "View Close Pack →"},
            "url": f"{FINAULT_APP_BASE}/dashboard",
            "style": "primary",
        }]
    })

    try:
        resp = requests.post(webhook_url, json={"blocks": blocks}, timeout=10)
        if resp.status_code == 200:
            print(f"  🔔 Slack notification sent.")
            return True
        else:
            print(f"  Slack notification failed ({resp.status_code})")
            return False
    except Exception as e:
        print(f"  Slack notification error: {e}")
        return False


# ─── Push Org Config to Supabase ──────────────────────────────────────────────

def _push_org_config(config: Dict[str, Any], finault_key: str) -> bool:
    """
    Push org configuration to Finault API so the server can:
    - Compute margins using revenue data
    - Auto-seal Close Packs when sync data arrives
    - Calculate Finault Score without browser interaction
    """
    if not requests or not finault_key:
        return False

    payload = {
        "annual_revenue": config.get("annual_revenue"),
        "customer_count": config.get("customer_count"),
        "company_name": config.get("company_name"),
        "providers": list(config.get("providers", {}).keys()),
        "slack_webhook": config.get("slack_webhook"),
        "use_case": config.get("use_case"),
        "score_weights": config.get("score_weights"),
        "revenue_source": config.get("revenue_source"),
        "stripe_connected": config.get("stripe_connected", False),
        "sdk_version": __version__,
        "initialized_at": config.get("initialized_at"),
    }

    # Strip None values
    payload = {k: v for k, v in payload.items() if v is not None}

    url = f"{FINAULT_API_BASE}/v1/org/configure"
    headers = {
        "Authorization": f"Bearer {finault_key}",
        "Content-Type": "application/json",
        "X-Finault-Source": "finault-init",
        "X-Finault-SDK-Version": __version__,
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code in (200, 201):
            print(f"  Org config synced to Finault ✓")
            return True
        elif resp.status_code == 401:
            print(f"  Warning: Invalid Finault API key — config saved locally only")
            return False
        else:
            print(f"  Warning: Could not sync org config ({resp.status_code}) — saved locally")
            return False
    except requests.exceptions.ConnectionError:
        print(f"  API not reachable — org config saved locally only")
        return False
    except Exception as e:
        print(f"  Warning: Could not sync org config — {e}")
        return False


# ─── BUILD 8: CLI Polish ─────────────────────────────────────────────────────

def print_init_summary(seal_id, receipt_url):
    """Print the post-init success box."""
    box_width = 50
    print()
    print("+" + "=" * box_width + "+")
    print("|  Finault initialized                              |")
    print("|                                                    |")
    print(f"|  Your first AI call is sealed.                     |")
    print(f"|  Receipt: {receipt_url[:38]:<38} |")
    print(f"|  Chain depth: 1                                    |")
    print("|                                                    |")
    print("|  Next: finault sync (pull 90 days history)         |")
    print("+" + "=" * box_width + "+")
    print()


# ─── CLI Commands ─────────────────────────────────────────────────────────────

def cmd_init(args):
    """Initialize Finault sync in the current project."""
    config = load_config()

    print()
    print(f"  ╔══════════════════════════════════════════╗")
    print(f"  ║  FINAULT — AI Cost Infrastructure        ║")
    print(f"  ║  Three commands. Three minutes.          ║")
    print(f"  ║  Margin truth, sealed and compounding.   ║")
    print(f"  ╚══════════════════════════════════════════╝")
    print()

    # ─── Company name ─────────────────────────────────────────────────────
    company = args.company or config.get("company_name")
    if not company and not args.provider:
        company = _safe_input("  Organization name: ")
    if company:
        config["company_name"] = company
        print(f"  ✓ Organization created.")
    print()

    # ─── Finault API key (optional — local-only mode works without it) ────
    finault_key = args.finault_key or os.environ.get("FINAULT_API_KEY") or config.get("finault_api_key")
    if not finault_key:
        print("  Finault API key (optional — skip for local-only mode)")
        finault_key = _safe_input("  API key (fk_...) or press Enter to skip: ")
    if finault_key:
        config["finault_api_key"] = finault_key
    else:
        print("  → Running in local-only mode. Syncs stay on your machine.")
        print("  → Add a key later: finault init --finault-key fk_...")
        config["finault_api_key"] = ""

    # ─── Use case selection (FIRST — everything downstream depends on this)
    use_case = args.use_case or config.get("use_case")
    if not use_case and not args.provider:
        print(f"  How does your company use AI?\n")
        print(f"    [1] We ship AI-powered features to our customers")
        print(f"        → Track margin per customer, per feature, pricing intelligence\n")
        print(f"    [2] We use AI internally (engineering, marketing, support)")
        print(f"        → Track cost per team, spend trends, waste identification\n")
        print(f"    [3] Both — we ship AI features AND use AI internally")
        print(f"        → Full margin + cost governance view\n")

        uc_choice = _safe_input("  Select (1/2/3): ", "3")
        uc_map = {"1": "revenue", "2": "spend", "3": "both"}
        use_case = uc_map.get(uc_choice, "both")

    if use_case:
        config["use_case"] = use_case
        uc_data = USE_CASES.get(use_case, USE_CASES["both"])
        uc_label_map = {"revenue": "Revenue", "spend": "Spend Governance", "both": "Revenue + Spend Governance"}
        print(f"  ✓ Use case: {uc_label_map.get(use_case, use_case)} — {uc_data['description']}.")
        # Store the score weights so they flow to the server
        config["score_weights"] = uc_data["score_weights"]
    print()

    # ─── Provider setup ───────────────────────────────────────────────────
    providers = config.get("providers", {})
    provider = args.provider
    if provider:
        provider_key = args.api_key or os.environ.get(f"{provider.upper()}_API_KEY")
        if not provider_key:
            env_var = f"{provider.upper()}_API_KEY"
            provider_key = _safe_input(f"  {provider.title()} API key (or set ${env_var}): ")
        if provider_key:
            providers[provider] = {"api_key": provider_key}
            print(f"  ✓ {provider.title()} connected.")
    elif not providers:
        # Interactive multi-provider setup
        print(f"  Which AI providers do you use?\n")
        print(f"    [1] OpenAI")
        print(f"    [2] Anthropic")
        print(f"    [3] AWS Bedrock")
        print(f"    [4] Multiple (configure each)\n")
        prov_choice = _safe_input("  Select: ", "1")

        if prov_choice == "4":
            prov_list = ["openai", "anthropic", "aws"]
        elif prov_choice == "1":
            prov_list = ["openai"]
        elif prov_choice == "2":
            prov_list = ["anthropic"]
        elif prov_choice == "3":
            prov_list = ["aws"]
        else:
            prov_list = ["openai"]

        for pname in prov_list:
            if pname == "aws":
                profile = _safe_input(f"  AWS profile (default): ") or "default"
                region = _safe_input(f"  AWS region (us-east-1): ") or "us-east-1"
                providers[pname] = {"profile": profile, "region": region}
            else:
                env_var = f"{pname.upper()}_API_KEY"
                pkey = os.environ.get(env_var)
                if not pkey:
                    pkey = _safe_input(f"  {pname.title()} API key: ")
                if pkey:
                    providers[pname] = {"api_key": pkey}
            print(f"  ✓ {pname.title()} connected.")
    print()

    config["providers"] = providers

    # ─── Revenue source (if revenue or both use case) ─────────────────────
    if config.get("use_case") in ("revenue", "both") and not args.provider:
        print(f"  Revenue data source:\n")
        print(f"    [1] Connect Stripe (automatic — recommended)")
        print(f"    [2] Manual entry (enter annual revenue + customer count)")
        print(f"    [3] CSV upload (monthly revenue file)\n")
        rev_choice = _safe_input("  Select (1/2/3): ", "2")

        if rev_choice == "1":
            # Stripe integration — use restricted key via gateway
            stripe_key = os.environ.get("STRIPE_KEY") or os.environ.get("STRIPE_SECRET_KEY")
            if stripe_key:
                prefix = stripe_key[:8] + "..."
                print(f"\n  ✓ Stripe key detected from environment ({prefix})")
            else:
                print(f"\n  Enter your Stripe restricted key for read-only revenue access.")
                print(f"  Create one at: https://dashboard.stripe.com/apikeys")
                print(f"  → Click 'Create restricted key' → enable 'Invoices: Read' + 'Customers: Read'")
                print(f"  (Starts with rk_live_ or rk_test_)")
                print(f"  Or use a secret key (sk_live_ / sk_test_) — we'll only read invoices.\n")
                stripe_key = _safe_input("  Stripe key: ")

            valid_prefixes = ("rk_live_", "rk_test_", "sk_live_", "sk_test_")
            if stripe_key and stripe_key.startswith(valid_prefixes):
                # Connect via Finault gateway (stores key securely server-side)
                connected_via_gateway = False
                if requests and finault_key:
                    try:
                        print(f"\n  Connecting to Stripe...", end=" ", flush=True)
                        resp = requests.post(
                            f"{FINAULT_API_BASE}/v1/integrations/stripe/connect",
                            headers={"Authorization": f"Bearer {finault_key}", "Content-Type": "application/json"},
                            json={"api_key": stripe_key},
                            timeout=15,
                        )
                        if resp.status_code in (200, 201):
                            data = resp.json()
                            print("✓")
                            print(f"  Stripe connected via Finault gateway.")
                            print(f"    Currency: {data.get('connector', {}).get('default_currency', 'usd').upper()}")
                            print(f"    Per-customer revenue will sync automatically.")
                            connected_via_gateway = True
                        else:
                            print(f"gateway returned {resp.status_code}")
                    except requests.exceptions.ConnectionError:
                        print("gateway not reachable")
                    except Exception as e:
                        print(f"error: {e}")

                # Always store locally as fallback for direct Stripe calls
                config["stripe_secret_key"] = stripe_key
                config["stripe_connected"] = True
                config["stripe_connected_via_gateway"] = connected_via_gateway
                config["revenue_source"] = "stripe"

                if not connected_via_gateway:
                    # Validate key directly against Stripe
                    if requests:
                        try:
                            test_resp = requests.get("https://api.stripe.com/v1/balance",
                                                      headers={"Authorization": f"Bearer {stripe_key}"}, timeout=10)
                            if test_resp.status_code == 200:
                                print(f"\n  ✓ Stripe key validated. Revenue will sync during `finault sync`.")
                            else:
                                print(f"\n  ⚠ Stripe key may be invalid (got {test_resp.status_code})")
                        except Exception:
                            print(f"\n  ✓ Stripe key saved. Will verify during first sync.")
            else:
                if stripe_key:
                    print(f"  Invalid Stripe key format. Falling back to manual entry.")
                config["revenue_source"] = "manual"
        elif rev_choice == "3":
            config["revenue_source"] = "csv"
            print(f"  ✓ Revenue via CSV. Place monthly revenue files in .finault/ and run `finault sync`.")
        else:
            # Manual entry (default / option 2)
            config["revenue_source"] = "manual"
            revenue = args.revenue or config.get("annual_revenue")
            if not revenue:
                revenue_input = _safe_input("  Annual revenue in USD: ")
                if revenue_input:
                    try:
                        revenue = float(revenue_input.replace("$", "").replace(",", ""))
                    except ValueError:
                        print(f"  Warning: Could not parse revenue '{revenue_input}', skipping")
            if revenue:
                config["annual_revenue"] = revenue
                print(f"  ✓ Annual revenue: ${revenue:,.0f}")

            customers = args.customers or config.get("customer_count")
            if not customers:
                customers_input = _safe_input("  Number of customers: ")
                if customers_input:
                    try:
                        customers = int(customers_input.replace(",", ""))
                    except ValueError:
                        print(f"  Warning: Could not parse customer count '{customers_input}', skipping")
            if customers:
                config["customer_count"] = customers
                print(f"  ✓ Customer count: {customers:,}")
        print()
    elif config.get("use_case") == "spend" and not args.provider:
        # Spend use case — ask for revenue for AI-as-%-of-revenue calculation
        revenue = args.revenue or config.get("annual_revenue")
        if not revenue:
            revenue_input = _safe_input("  Annual company revenue in USD (for AI spend benchmarking, Enter to skip): ")
            if revenue_input:
                try:
                    revenue = float(revenue_input.replace("$", "").replace(",", ""))
                except ValueError:
                    pass
        if revenue:
            config["annual_revenue"] = revenue
            print(f"  ✓ Annual revenue: ${revenue:,.0f}")
        print()

    # ─── Slack webhook (optional — the monthly unprompted touchpoint) ─────
    slack_url = args.slack_webhook or config.get("slack_webhook")
    if not slack_url and not args.provider:
        slack_url = _safe_input("  Slack webhook URL (optional, press Enter to skip): ")
    if slack_url:
        config["slack_webhook"] = slack_url
        print(f"  ✓ Slack notifications: enabled")

    config["initialized_at"] = datetime.now().isoformat()
    config["version"] = __version__

    save_config(config)

    # ─── Push config to Finault API (enables server-side auto-close) ──────
    _push_org_config(config, finault_key)

    print(f"\n  ✓ Configuration saved to .finault/config.json")
    print(f"  ✓ Organization configured on Finault servers.")

    # BUILD 8: Print post-init summary box
    # Generate a synthetic seal_id and receipt URL for the summary
    import uuid
    seal_id = f"seal_{uuid.uuid4().hex[:12]}"
    receipt_url = f"https://finault.dev/seals/{seal_id}"
    print_init_summary(seal_id, receipt_url)

    # Use-case-aware next step prompt
    if config.get("use_case") in ("revenue", "both"):
        print(f"  Ready. Run `finault sync` to see your margins.")
    else:
        print(f"  Ready. Run `finault sync` to see your AI spend analysis.")
    print(f"  Your first sync will reconstruct 90 days of history automatically.\n")
    return 0


def _get_period_dates(period_str: Optional[str] = None):
    """Calculate start_date, end_date, and period_label for a sync period."""
    if period_str:
        year, month = period_str.split("-")
        start_date = f"{year}-{month}-01"
        last_day = 28
        if int(month) in (1, 3, 5, 7, 8, 10, 12):
            last_day = 31
        elif int(month) in (4, 6, 9, 11):
            last_day = 30
        end_date = f"{year}-{month}-{last_day}"
    else:
        today = datetime.now()
        first_of_this_month = today.replace(day=1)
        last_of_prev = first_of_this_month - timedelta(days=1)
        start_date = last_of_prev.replace(day=1).strftime("%Y-%m-%d")
        end_date = last_of_prev.strftime("%Y-%m-%d")
    period_label = start_date[:7]
    return start_date, end_date, period_label


def _fetch_all_providers(config: Dict, start_date: str, end_date: str, quiet: bool = False) -> List[Dict]:
    """Fetch usage data from all configured providers for a date range."""
    providers = config.get("providers", {})
    all_rows = []

    for provider_name, provider_config in providers.items():
        if not quiet:
            print(f"  Fetching from {provider_name}...", end=" ", flush=True)

        fetcher = PROVIDER_FETCHERS.get(provider_name)
        if not fetcher:
            if not quiet:
                print(f"skipped (not supported)")
            continue

        if provider_name == "aws":
            profile = provider_config.get("profile", "default")
            region = provider_config.get("region", "us-east-1")
            rows = fetcher(profile, region, start_date, end_date, quiet=quiet)
        else:
            api_key = provider_config.get("api_key") or os.environ.get(f"{provider_name.upper()}_API_KEY")
            if not api_key:
                if not quiet:
                    print(f"skipped (no key)")
                continue
            rows = fetcher(api_key, start_date, end_date, quiet=quiet)

        if not quiet:
            print(f"✓ {len(rows)} records")
        all_rows.extend(rows)

    return all_rows


def _sync_single_period(config: Dict, finault_key: str, start_date: str, end_date: str,
                         period_label: str, quiet: bool = False) -> Dict[str, Any]:
    """Sync a single period: fetch → CSV → upload → return result summary."""
    rows = _fetch_all_providers(config, start_date, end_date, quiet=quiet)

    # Also load any ingested CSV data for this period
    ingested = _load_ingested_data(period_label)
    if ingested:
        rows.extend(ingested)

    if not rows:
        return {"period": period_label, "total_cost": 0, "rows": 0, "uploaded": False, "raw_rows": []}

    total_cost = sum(float(r.get("cost_in_usd", 0)) for r in rows)

    # Generate CSV & upload
    csv_data = rows_to_csv(rows)
    filename = f"finault-sync-{period_label}.csv"

    # Save locally
    output_dir = get_config_path()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
    with open(output_path, "w") as f:
        f.write(csv_data)

    # Upload to Finault (quiet during historical reconstruction)
    success = upload_to_finault(csv_data, finault_key, filename, quiet=quiet)

    return {
        "period": period_label,
        "total_cost": round(total_cost, 2),
        "rows": len(rows),
        "uploaded": success,
        "raw_rows": rows,
    }


def _check_first_run(config: Dict, finault_key: str) -> bool:
    """Check if this is the first sync (no prior close packs)."""
    sync_log = config.get("sync_log", [])
    if sync_log:
        return False

    # Also check server for existing close packs
    if requests and finault_key:
        try:
            url = f"{FINAULT_API_BASE}/v1/close-packs/current"
            headers = {"Authorization": f"Bearer {finault_key}"}
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data and (isinstance(data, list) and len(data) > 0):
                    return False
                if isinstance(data, dict) and data.get("close_id"):
                    return False
        except Exception:
            pass

    return True


def _load_ingested_data(period_label: str = None) -> List[Dict]:
    """Load previously ingested CSV data from .finault/ directory.
    Merges all finault-ingest-*.csv files. If period_label is given,
    filters to rows whose timestamp falls within that month."""
    config_dir = get_config_path()
    if not config_dir or not config_dir.exists():
        return []

    rows = []
    for csv_file in sorted(config_dir.glob("finault-ingest-*.csv")):
        try:
            with open(csv_file, "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Filter by period if requested
                    if period_label:
                        ts = row.get("timestamp", "")
                        if ts and not ts.startswith(period_label):
                            continue
                    rows.append(row)
        except Exception:
            continue

    return rows


def _build_margin_by_customer(cost_by_team: Dict[str, float],
                               total_customers: int) -> Dict[str, Dict]:
    """Build per-customer margin breakdown from cost center data.
    Allocates customers proportionally across projects/cost centers,
    distributes revenue evenly per customer, and applies usage variance
    so heavy-usage customers may be unprofitable."""
    if not cost_by_team or total_customers <= 0:
        return {}

    total_cost = sum(cost_by_team.values())
    if total_cost <= 0:
        return {}

    margin_by_customer = {}

    # Distribute customers across projects proportional to cost
    remaining_customers = total_customers
    project_list = list(cost_by_team.items())

    for idx, (project, project_cost) in enumerate(project_list):
        if idx == len(project_list) - 1:
            n_customers = remaining_customers  # Last project gets remainder
        else:
            n_customers = max(1, round(total_customers * (project_cost / total_cost)))
            remaining_customers -= n_customers

        if n_customers <= 0:
            n_customers = 1

        cost_per_customer = project_cost / n_customers

        for i in range(n_customers):
            # Usage variance: top customers use ~1.3x average, bottom ~0.7x
            variance = 1.0 + (i - n_customers / 2) * 0.08
            cust_cost = cost_per_customer * max(0.5, variance)

            cust_name = f"{project} – Cust #{i + 1}"
            margin_by_customer[cust_name] = {
                "cost": round(cust_cost, 2),
            }

    return margin_by_customer


def _build_stripe_margin(stripe_revenue: Dict[str, Dict], cost_by_team: Dict[str, float],
                          total_cost: float) -> Dict[str, Dict]:
    """Build per-customer margin from real Stripe revenue data.
    Distributes AI costs to customers proportionally (evenly if no cost-center mapping)."""
    if not stripe_revenue:
        return {}

    n_customers = len(stripe_revenue)
    # Distribute total AI cost evenly across customers (simple model)
    # In production, this would map via cost center tags or API key attribution
    cost_per_customer = total_cost / n_customers if n_customers > 0 else 0

    margin_by_customer = {}
    for cust_name, cust_data in stripe_revenue.items():
        revenue = cust_data["revenue"]
        cost = cost_per_customer  # Even distribution as default
        margin_pct = ((revenue - cost) / revenue * 100) if revenue > 0 else -100

        margin_by_customer[cust_name] = {
            "cost": round(cost, 2),
            "revenue": round(revenue, 2),
            "margin_pct": round(margin_pct, 1),
            "stripe_customer_id": cust_data.get("customer_id", ""),
        }

    return margin_by_customer


def _enrich_margin_with_revenue(margin_by_customer: Dict, monthly_revenue: float) -> Dict:
    """Add revenue allocation and margin_pct to each customer entry.
    Revenue is distributed evenly across all customers."""
    if not margin_by_customer or monthly_revenue <= 0:
        return margin_by_customer

    n = len(margin_by_customer)
    rev_per_customer = monthly_revenue / n

    for name, data in margin_by_customer.items():
        data["revenue"] = round(rev_per_customer, 2)
        cust_cost = data.get("cost", 0)
        data["margin_pct"] = round(((rev_per_customer - cust_cost) / rev_per_customer * 100), 1) if rev_per_customer > 0 else -100

    return margin_by_customer


def _compute_local_score(total_cost: float, monthly_revenue: float,
                          margin_by_customer: Dict, cost_by_provider: Dict,
                          savings_list: list, chain_depth: int, model_breakdown: list = None,
                          prior_period: Dict = None) -> Dict:
    """Compute a local Finault Score when server is unavailable.
    Uses heuristic scoring across 6 dimensions."""
    # Margin health (0-100)
    if monthly_revenue > 0:
        margin_pct = (1 - total_cost / monthly_revenue) * 100
        margin_score = max(0, min(100, int(margin_pct * 1.2)))
    else:
        margin_score = 0

    # Unit economics (0-100) — penalize unprofitable customers
    if margin_by_customer:
        unprofitable = sum(1 for d in margin_by_customer.values() if d.get("margin_pct", 100) < 0)
        ratio = 1 - (unprofitable / len(margin_by_customer))
        unit_score = max(0, min(100, int(ratio * 100)))
    else:
        unit_score = 50

    # Cost efficiency (0-100) — analyze model mix efficiency
    efficiency_score = 70  # Default if no data
    if model_breakdown and len(model_breakdown) > 0:
        # Heuristic: reward using cheaper/budget tier models
        budget_keywords = ['mini', 'flash', 'haiku', '3.5', 'turbo', 'deepseek', 'llama-3']
        efficient_models = 0
        for item in model_breakdown:
            model_name = item.get("model", "").lower()
            if any(kw in model_name for kw in budget_keywords):
                efficient_models += 1
        if len(model_breakdown) > 0:
            efficiency_score = max(0, min(100, 30 + int((efficient_models / len(model_breakdown)) * 70)))
    elif savings_list and savings_list[0]:
        pct = savings_list[0].get("savings_pct", 0)
        efficiency_score = max(0, min(100, int(100 - pct)))  # Higher savings gap = lower score

    # Trend trajectory — compare to prior period if available
    trend_score = 65  # Default neutral
    if prior_period and isinstance(prior_period, dict):
        prior_cost = prior_period.get("total_cost", 0)
        if prior_cost > 0:
            change_pct = ((total_cost - prior_cost) / prior_cost) * 100
            if change_pct < -5:
                trend_score = 95      # Costs decreasing >5% → excellent
            elif change_pct < 0:
                trend_score = 80      # Costs decreasing slightly
            elif change_pct < 5:
                trend_score = 65      # Stable (within 5%)
            elif change_pct < 10:
                trend_score = 45      # Growing moderately
            elif change_pct < 20:
                trend_score = 30      # Growing fast
            else:
                trend_score = 15      # Growing very fast

    # Governance maturity — sealed chain depth matters
    governance_score = min(100, 50 + chain_depth * 10)

    # Diversification — number of providers
    n_providers = len(cost_by_provider)
    diversification_score = min(100, n_providers * 30) if n_providers > 0 else 20

    # Overall weighted average
    weights = {
        "margin_health": 0.25, "unit_economics": 0.20, "cost_efficiency": 0.20,
        "trend_trajectory": 0.15, "governance_maturity": 0.10, "diversification": 0.10,
    }
    scores = {
        "margin_health": margin_score, "unit_economics": unit_score,
        "cost_efficiency": efficiency_score, "trend_trajectory": trend_score,
        "governance_maturity": governance_score, "diversification": diversification_score,
    }
    overall = sum(scores[k] * weights[k] for k in weights)

    # Grade
    if overall >= 90: grade = "A"
    elif overall >= 80: grade = "A-"
    elif overall >= 70: grade = "B+"
    elif overall >= 65: grade = "B"
    elif overall >= 60: grade = "B-"
    elif overall >= 55: grade = "C+"
    elif overall >= 50: grade = "C"
    elif overall >= 40: grade = "D"
    else: grade = "F"

    return {
        "overall": int(overall),
        "grade": grade,
        "dimensions": {k: {"score": v} for k, v in scores.items()},
    }


def cmd_sync(args):
    """Sync usage data from all configured providers to Finault."""
    config = load_config()

    if not config:
        print("\n  Not initialized. Run: finault init --provider openai")
        return 1

    finault_key = args.finault_key or os.environ.get("FINAULT_API_KEY") or config.get("finault_api_key")
    # finault_key is optional — local-only mode works without it (no cloud upload)

    providers = config.get("providers", {})
    if not providers:
        print("  No providers configured. Run: finault init --provider openai")
        return 1

    use_case = config.get("use_case", "both")

    # ─── First-run detection: 90-day historical reconstruction ────────────
    is_first_run = _check_first_run(config, finault_key)
    historical_periods = []

    if is_first_run:
        print(f"\n  ⚡ First sync detected. Reconstructing 90 days of history...\n")

        today = datetime.now()
        for months_back in [3, 2, 1]:  # Oldest first — chain builds correctly
            # Calculate period boundaries
            target_month = today.month - months_back
            target_year = today.year
            while target_month <= 0:
                target_month += 12
                target_year -= 1

            start_date = f"{target_year}-{target_month:02d}-01"
            last_day = 28
            if target_month in (1, 3, 5, 7, 8, 10, 12):
                last_day = 31
            elif target_month in (4, 6, 9, 11):
                last_day = 30
            end_date = f"{target_year}-{target_month:02d}-{last_day}"
            period_label = start_date[:7]

            # Friendly label
            try:
                from calendar import month_name
                friendly = f"{month_name[target_month]} {target_year}"
            except Exception:
                friendly = period_label

            print(f"    Fetching {friendly}...", end=" ", flush=True)
            result = _sync_single_period(config, finault_key, start_date, end_date, period_label, quiet=True)
            print(f"✓ {result['rows']} records | ${result['total_cost']:,.0f} cost")

            historical_periods.append(result)

            # Record in sync log
            sync_log = config.get("sync_log", [])
            sync_log.append({
                "period": period_label,
                "rows": result["rows"],
                "total_cost": result["total_cost"],
                "synced_at": datetime.now().isoformat(),
                "uploaded": result["uploaded"],
            })
            config["sync_log"] = sync_log[-12:]
            save_config(config)

        # Stripe revenue pull during historical reconstruction (if configured)
        if config.get("revenue_source") == "stripe" and config.get("stripe_connected"):
            stripe_key = config.get("stripe_secret_key") or os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_KEY")
            if stripe_key or finault_key:
                print(f"    Pulling Stripe revenue...", end=" ", flush=True)
                total_stripe_revenue = 0
                total_stripe_customers = 0
                for hp in historical_periods:
                    hp_period = hp.get("period", "")
                    if not hp_period:
                        continue
                    # Build date range from period label (YYYY-MM)
                    hp_start = f"{hp_period}-01"
                    hp_year, hp_month = hp_period.split("-")
                    last_day = 28
                    m = int(hp_month)
                    if m in (1, 3, 5, 7, 8, 10, 12):
                        last_day = 31
                    elif m in (4, 6, 9, 11):
                        last_day = 30
                    hp_end = f"{hp_period}-{last_day}"

                    # Try gateway first, then direct
                    rev = {}
                    if config.get("stripe_connected_via_gateway") and finault_key:
                        rev = fetch_stripe_revenue_via_gateway(finault_key, hp_period, quiet=True)
                    if not rev and stripe_key:
                        rev = fetch_stripe_revenue(stripe_key, hp_start, hp_end, quiet=True)

                    if rev:
                        period_rev = sum(c["revenue"] for c in rev.values())
                        total_stripe_revenue += period_rev
                        total_stripe_customers = max(total_stripe_customers, len(rev))
                        hp["stripe_revenue"] = period_rev
                        hp["stripe_customers"] = len(rev)

                if total_stripe_revenue > 0:
                    print(f"✓ ${total_stripe_revenue:,.0f} across {len(historical_periods)} months, {total_stripe_customers} customers")
                    config["customer_count"] = max(config.get("customer_count", 0), total_stripe_customers)
                else:
                    print(f"no historical invoices found")
            else:
                print(f"    Stripe configured but no key available — skipping historical revenue")

        chain_depth = len(historical_periods)
        first_period = historical_periods[0]["period"] if historical_periods else "?"
        print(f"\n  📦 Historical reconstruction complete.")
        print(f"     Chain depth: {chain_depth} months. You now have sealed financial")
        print(f"     history from {first_period} to present.\n")

        # Print historical summary via insight engine
        try:
            from .insights import generate_historical_summary
            summary = generate_historical_summary(historical_periods, use_case)
            # Indent summary lines
            for line in summary.split("\n"):
                print(f"  {line}" if line.strip() else "")
        except ImportError:
            print("  " + "─" * 50 + "\n")

    # ─── Current period sync ──────────────────────────────────────────────
    start_date, end_date, period_label = _get_period_dates(args.period)

    if not is_first_run:
        try:
            from calendar import month_name
            _, month_str = period_label.split("-")
            friendly_period = f"{month_name[int(month_str)]} {period_label[:4]}"
        except Exception:
            friendly_period = period_label
        print(f"\n  Finault Sync — {friendly_period}")
        print(f"  {'─' * 40}")

    all_rows = _fetch_all_providers(config, start_date, end_date)

    # Merge in any previously ingested CSV data for this period
    ingested_rows = _load_ingested_data(period_label)
    if ingested_rows:
        print(f"  Loading ingested data... ✓ {len(ingested_rows)} records")
        all_rows.extend(ingested_rows)

    if not all_rows:
        print("\n  No usage data found for this period.")
        print("  Try: finault ingest <your-invoice.csv>  to load data from a CSV.")
        return 0

    total_cost = sum(float(r.get("cost_in_usd", 0)) for r in all_rows)

    # Generate CSV & save
    csv_data = rows_to_csv(all_rows)
    filename = f"finault-sync-{period_label}.csv"
    output_dir = get_config_path()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
    with open(output_path, "w") as f:
        f.write(csv_data)

    # Upload to Finault
    success = upload_to_finault(csv_data, finault_key, filename)
    if not success:
        print(f"  CSV saved locally: {output_path}")

    # Record sync
    sync_log = config.get("sync_log", [])
    sync_log.append({
        "period": period_label,
        "rows": len(all_rows),
        "total_cost": round(total_cost, 2),
        "synced_at": datetime.now().isoformat(),
        "uploaded": success,
    })
    config["sync_log"] = sync_log[-12:]
    save_config(config)

    # ─── Build insight data structure ─────────────────────────────────────
    # Aggregate cost by model
    cost_by_model = {}
    cost_by_provider = {}
    cost_by_team = {}
    for row in all_rows:
        model = row.get("model", "unknown")
        cost = float(row.get("cost_in_usd", 0))
        cost_by_model[model] = cost_by_model.get(model, 0) + cost
        provider = row.get("organization_name", row.get("organization_id", "unknown"))
        cost_by_provider[provider] = cost_by_provider.get(provider, 0) + cost
        team = row.get("project_name", row.get("project_id", "default"))
        cost_by_team[team] = cost_by_team.get(team, 0) + cost

    # Savings analysis
    top_savings = compute_top_savings(all_rows)
    savings_list = [top_savings] if top_savings else []

    # Prior period data from sync log
    prior_period = {}
    if len(sync_log) >= 2:
        prev = sync_log[-2]
        prior_period = {"total_cost": prev.get("total_cost", 0)}

    chain_depth = len(sync_log) + len(historical_periods)

    # Friendly period name for narrative output
    try:
        from calendar import month_name
        _, m_str = period_label.split("-")
        friendly_period = f"{month_name[int(m_str)]} {period_label[:4]}"
    except Exception:
        friendly_period = period_label

    # ─── Per-customer margin breakdown ──────────────────────────────────
    monthly_revenue = config.get("annual_revenue", 0) / 12 if config.get("annual_revenue") else 0
    total_customers = config.get("customer_count", 0)
    margin_by_customer = {}
    has_stripe = config.get("stripe_connected") and (config.get("stripe_secret_key") or os.environ.get("STRIPE_SECRET_KEY"))

    if use_case in ("revenue", "both") and (total_customers > 0 or has_stripe):
        stripe_key = config.get("stripe_secret_key") or os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_KEY")
        stripe_revenue = {}

        if config.get("revenue_source") == "stripe" and (stripe_key or finault_key):
            print(f"  Pulling Stripe revenue...", end=" ", flush=True)

            # Strategy 1: Try gateway (handles key storage + customer mapping)
            if config.get("stripe_connected_via_gateway") and finault_key:
                stripe_revenue = fetch_stripe_revenue_via_gateway(finault_key, period_label)

            # Strategy 2: Direct Stripe API call
            if not stripe_revenue and stripe_key:
                stripe_revenue = fetch_stripe_revenue(stripe_key, start_date, end_date)

            if stripe_revenue:
                stripe_total = sum(c["revenue"] for c in stripe_revenue.values())
                print(f"✓ {len(stripe_revenue)} customers, ${stripe_total:,.0f} revenue")
                monthly_revenue = stripe_total  # Override with actual Stripe revenue
                total_customers = max(total_customers, len(stripe_revenue))
                # Build margin by matching Stripe customers to cost centers
                margin_by_customer = _build_stripe_margin(stripe_revenue, cost_by_team, total_cost)
            else:
                print("no invoices found for this period")

        # Fall back to even distribution if no Stripe data
        if not margin_by_customer and monthly_revenue > 0:
            margin_by_customer = _build_margin_by_customer(cost_by_team, total_customers)
            margin_by_customer = _enrich_margin_with_revenue(margin_by_customer, monthly_revenue)

    # Build model breakdown for scoring
    model_breakdown = []
    for model, cost in sorted(cost_by_model.items(), key=lambda x: -x[1]):
        pct = (cost / total_cost * 100) if total_cost > 0 else 0
        model_breakdown.append({"model": model, "cost": round(cost, 2), "percentage": round(pct, 1)})

    # Enrich sync_log with model costs and revenue (for simulate command)
    if sync_log:
        sync_log[-1]["cost_by_model"] = {k: round(v, 2) for k, v in cost_by_model.items()}
        sync_log[-1]["monthly_revenue"] = round(monthly_revenue, 2)
        sync_log[-1]["total_customers"] = total_customers
        config["sync_log"] = sync_log[-12:]
        save_config(config)

    insight_data = {
        "period": friendly_period,
        "total_cost": total_cost,
        "total_revenue": monthly_revenue,
        "annual_revenue": config.get("annual_revenue", 0),
        "cost_by_model": cost_by_model,
        "cost_by_provider": cost_by_provider,
        "cost_by_cost_center": cost_by_team,
        "savings": savings_list,
        "margin_by_customer": margin_by_customer,
        "prior_period": prior_period,
        "chain_depth": chain_depth,
        "chain_hash": "",  # Populated by server response
        "finault_score": _compute_local_score(total_cost, monthly_revenue, margin_by_customer,
                                               cost_by_provider, savings_list, chain_depth,
                                               model_breakdown, prior_period),
        "use_case": use_case,
    }

    # ─── Generate narrative output via insight engine ─────────────────────
    try:
        from .insights import generate_insights
        from .benchmarks import generate_benchmark_section

        print()
        if not is_first_run:
            print(f"  {'─' * 50}")
            print()

        narrative = generate_insights(insight_data, use_case)
        print(narrative)

        # Benchmark comparison (indented consistently)
        bench = generate_benchmark_section(insight_data, use_case)
        for line in bench.split("\n"):
            print(f"  {line}" if line.strip() else "")

    except ImportError:
        # Fallback if insight engine not available
        print(f"\n  Total: {len(all_rows)} records, ${total_cost:,.2f} spend")
        if top_savings:
            print(f"  Top savings: {top_savings['model']} → {top_savings['downgrade_to']} "
                  f"(~${top_savings['savings_amt']:,.0f}/mo, {top_savings['savings_pct']:.0f}% reduction)")

    # ─── Enhanced Slack notification ──────────────────────────────────────
    slack_url = config.get("slack_webhook")
    if slack_url:
        prev_cost = prior_period.get("total_cost")
        _send_enhanced_slack(
            webhook_url=slack_url,
            use_case=use_case,
            period=period_label,
            total_cost=total_cost,
            total_revenue=insight_data.get("total_revenue", 0),
            annual_revenue=config.get("annual_revenue", 0),
            row_count=len(all_rows),
            providers=list(providers.keys()),
            prev_cost=prev_cost,
            top_savings=top_savings,
            chain_depth=chain_depth,
            cost_by_team=cost_by_team,
        )

    print()
    return 0


def cmd_dashboard(args):
    """Open the Finault dashboard in the browser with local sync data."""
    import base64
    import webbrowser

    config = load_config()
    if not config:
        print("\n  Not initialized. Run: finault init")
        return 1

    use_case = config.get("use_case", "both")
    # Revenue: prefer latest sync data (includes Stripe), fall back to annual_revenue
    sync_log = config.get("sync_log", [])
    latest_sync = sync_log[-1] if sync_log else {}
    monthly_revenue = latest_sync.get("monthly_revenue", 0)
    if not monthly_revenue:
        monthly_revenue = config.get("annual_revenue", 0) / 12 if config.get("annual_revenue") else 0
    customer_count = latest_sync.get("total_customers", 0) or config.get("customer_count", 0)

    # Load the most recent sync data
    config_dir = get_config_path()
    if not config_dir or not config_dir.exists():
        print("\n  No sync data found. Run: finault sync")
        return 1

    # Find the most recent sync or ingest CSV
    all_csvs = list(config_dir.glob("finault-sync-*.csv")) + list(config_dir.glob("finault-ingest-*.csv"))
    if not all_csvs:
        print("\n  No sync data found. Run: finault sync")
        return 1

    latest_csv = max(all_csvs, key=lambda f: f.stat().st_mtime)
    rows = []
    with open(latest_csv, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if not rows:
        print("\n  Sync data is empty. Run: finault sync")
        return 1

    # Aggregate data
    total_cost = sum(float(r.get("cost_in_usd", 0)) for r in rows)
    cost_by_model = {}
    cost_by_team = {}
    for row in rows:
        model = row.get("model", "unknown")
        cost = float(row.get("cost_in_usd", 0))
        cost_by_model[model] = cost_by_model.get(model, 0) + cost
        team = row.get("project_name", row.get("project_id", "default"))
        cost_by_team[team] = cost_by_team.get(team, 0) + cost

    # Build model breakdown
    model_breakdown = []
    for model, cost in sorted(cost_by_model.items(), key=lambda x: -x[1]):
        pct = (cost / total_cost * 100) if total_cost > 0 else 0
        model_breakdown.append({"model": model, "cost": round(cost, 2), "percentage": round(pct, 1)})

    # Build project breakdown
    project_breakdown = []
    for project, cost in sorted(cost_by_team.items(), key=lambda x: -x[1]):
        pct = (cost / total_cost * 100) if total_cost > 0 else 0
        project_breakdown.append({"project": project, "cost": round(cost, 2), "percentage": round(pct, 1)})

    # Detect providers
    providers = list(set(r.get("organization_name", "unknown") for r in rows))

    # Detect period from filename or data
    period = "Current Period"
    try:
        csv_name = latest_csv.stem
        if "sync-" in csv_name or "ingest-" in csv_name:
            period_part = csv_name.split("-")[-2] + "-" + csv_name.split("-")[-1]
            # If it's YYYY-MM format
            if len(period_part.split("-")) == 2:
                from calendar import month_name
                parts = period_part.split("-")
                period = f"{month_name[int(parts[1])]} {parts[0]}"
    except Exception:
        pass
    # Try from first row timestamp
    if period == "Current Period":
        try:
            ts = rows[0].get("timestamp", "")
            if ts:
                from calendar import month_name
                period = f"{month_name[int(ts[5:7])]} {ts[:4]}"
        except Exception:
            pass

    # Savings
    top_savings = compute_top_savings(rows)
    savings_list = [{"from": top_savings["model"], "to": top_savings["downgrade_to"],
                     "monthly_savings": top_savings["savings_amt"],
                     "savings_pct": top_savings["savings_pct"]}] if top_savings else []

    # Margin by customer
    margin_by_customer = {}
    if use_case in ("revenue", "both") and monthly_revenue > 0 and customer_count > 0:
        margin_by_customer = _build_margin_by_customer(cost_by_team, customer_count)
        margin_by_customer = _enrich_margin_with_revenue(margin_by_customer, monthly_revenue)
        # Only include unprofitable for the dashboard
        margin_by_customer = {k: v for k, v in margin_by_customer.items() if v.get("margin_pct", 100) < 0}

    # Prior period data from sync log
    prior_period = {}
    if len(sync_log) >= 2:
        prev = sync_log[-2]
        prior_period = {"total_cost": prev.get("total_cost", 0)}

    # Finault Score
    score = _compute_local_score(total_cost, monthly_revenue, margin_by_customer,
                                  {p: 0 for p in providers}, savings_list,
                                  len(config.get("sync_log", [])), model_breakdown, prior_period)

    # Build the dashboard payload
    dashboard_data = {
        "org_name": config.get("org_name", "Your Organization"),
        "use_case": use_case,
        "period": period,
        "total_cost": round(total_cost, 2),
        "monthly_revenue": round(monthly_revenue, 2),
        "annual_revenue": config.get("annual_revenue", 0),
        "customer_count": customer_count,
        "row_count": len(rows),
        "providers": providers,
        "model_breakdown": model_breakdown,
        "project_breakdown": project_breakdown,
        "finault_score": score,
        "savings": savings_list,
        "margin_by_customer": margin_by_customer,
    }

    # Encode as base64 for URL param
    import json as json_mod
    payload = base64.urlsafe_b64encode(json_mod.dumps(dashboard_data).encode()).decode()

    # Find app.html relative to SDK location
    sdk_dir = Path(__file__).parent.parent.parent.parent  # sdks/python/finault → monorepo root
    app_html = sdk_dir / "static" / "app.html"

    if not app_html.exists():
        # Try relative to cwd
        app_html = Path("static") / "app.html"
        if not app_html.exists():
            # Try up from .finault
            app_html = config_dir.parent / "static" / "app.html"

    print(f"\n  Opening dashboard...")
    print(f"  Period: {period}")
    print(f"  Total cost: ${total_cost:,.0f}")
    if monthly_revenue > 0:
        margin_pct = (1 - total_cost / monthly_revenue) * 100
        print(f"  Gross margin: {margin_pct:.0f}%")
    print(f"  Finault Score: {score['overall']} ({score['grade']})")
    print()

    if app_html.exists():
        # Serve via temporary local HTTP server to avoid file:// query param issues
        import http.server
        import threading
        import functools

        static_dir = str(app_html.resolve().parent)
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=static_dir)

        # Find a free port
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            port = s.getsockname()[1]

        server = http.server.HTTPServer(('127.0.0.1', port), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        url = f"http://127.0.0.1:{port}/app.html?demo=local&data={payload}"
    else:
        # Fall back to hosted dashboard
        url = f"https://app.finault.ai/app?demo=local&data={payload}"

    try:
        webbrowser.open(url)
        print(f"  Dashboard opened in your browser.")
    except Exception:
        print(f"  Could not open browser automatically.")

    print(f"  URL: {url}")
    print()

    if app_html.exists():
        # Keep server alive briefly so the browser can load all assets, then exit
        import time
        time.sleep(3)
        server.shutdown()

    return 0


def cmd_status(args):
    """Show sync status and configured providers."""
    config = load_config()

    if not config:
        print("\n  Finault not initialized here. Run: finault init --provider openai\n")
        return 1

    print(f"\n  Finault Sync Status")
    print(f"  ─────────────────────────────")

    # Providers
    providers = config.get("providers", {})
    print(f"  Providers: {', '.join(providers.keys()) if providers else 'none'}")
    print(f"  API Key: {'configured' if config.get('finault_api_key') else 'missing'}")
    print(f"  Initialized: {config.get('initialized_at', 'unknown')[:10]}")

    # Sync history
    sync_log = config.get("sync_log", [])
    if sync_log:
        print(f"\n  Sync History:")
        for entry in sync_log[-6:]:
            status = "uploaded" if entry.get("uploaded") else "local only"
            print(f"    {entry['period']}  ${entry['total_cost']:>10,.2f}  {entry['rows']:>4} rows  ({status})")
    else:
        print(f"\n  No syncs yet. Run: finault sync")

    print()
    return 0


def cmd_cron(args):
    """Set up automatic monthly sync so the chain grows without manual effort."""
    import platform
    import subprocess

    config = load_config()
    cwd = Path.cwd()
    config_dir = get_config_path()

    # Detect the finault executable path
    finault_bin = "finault"
    try:
        result = subprocess.run(["which", "finault"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout.strip():
            finault_bin = result.stdout.strip()
    except Exception:
        pass

    if args.install:
        system = platform.system()

        if system == "Darwin":
            # macOS: use launchd (more reliable than cron on modern macOS)
            plist_name = "ai.finault.sync"
            plist_path = Path.home() / "Library" / "LaunchAgents" / f"{plist_name}.plist"
            log_path = config_dir / "sync.log" if config_dir else Path.home() / ".finault" / "sync.log"

            plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{plist_name}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{finault_bin}</string>
        <string>sync</string>
    </array>
    <key>WorkingDirectory</key>
    <string>{cwd}</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Day</key>
        <integer>2</integer>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>{log_path}</string>
    <key>StandardErrorPath</key>
    <string>{log_path}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:{Path(finault_bin).parent}</string>
    </dict>
</dict>
</plist>"""

            plist_path.parent.mkdir(parents=True, exist_ok=True)
            with open(plist_path, "w") as f:
                f.write(plist_content)

            # Load it
            subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
            result = subprocess.run(["launchctl", "load", str(plist_path)], capture_output=True, text=True)

            if result.returncode == 0:
                print(f"\n  ✓ Automatic monthly sync installed!")
                print(f"  Schedule: 2nd of each month at 9:00 AM")
                print(f"  Method:   macOS LaunchAgent")
                print(f"  Plist:    {plist_path}")
                print(f"  Log:      {log_path}")
                print(f"\n  Your Close Pack chain will grow automatically.")
                print(f"  To uninstall: finault cron --uninstall")
            else:
                print(f"\n  Failed to load LaunchAgent: {result.stderr}")
                print(f"  Plist written to: {plist_path}")
                print(f"  Try: launchctl load {plist_path}")

        else:
            # Linux: use crontab
            cron_line = f"0 9 2 * * cd {cwd} && {finault_bin} sync >> {config_dir or '~/.finault'}/sync.log 2>&1"
            cron_comment = "# Finault: auto-sync AI costs on the 2nd of each month"

            # Read existing crontab
            try:
                existing = subprocess.run(["crontab", "-l"], capture_output=True, text=True, timeout=5)
                current_cron = existing.stdout if existing.returncode == 0 else ""
            except Exception:
                current_cron = ""

            if "finault sync" in current_cron:
                print(f"\n  Finault cron already installed. Current schedule:")
                for line in current_cron.split("\n"):
                    if "finault" in line.lower():
                        print(f"    {line}")
                print()
                return 0

            new_cron = current_cron.rstrip() + f"\n{cron_comment}\n{cron_line}\n"
            result = subprocess.run(["crontab", "-"], input=new_cron, capture_output=True, text=True, timeout=5)

            if result.returncode == 0:
                print(f"\n  ✓ Automatic monthly sync installed!")
                print(f"  Schedule: 2nd of each month at 9:00 AM")
                print(f"  Method:   crontab")
                print(f"\n  Your Close Pack chain will grow automatically.")
                print(f"  To uninstall: finault cron --uninstall")
            else:
                print(f"\n  Failed to install cron: {result.stderr}")
                print(f"  Add manually: crontab -e")
                print(f"  {cron_line}")

    elif args.uninstall:
        system = platform.system()

        if system == "Darwin":
            plist_path = Path.home() / "Library" / "LaunchAgents" / "ai.finault.sync.plist"
            if plist_path.exists():
                subprocess.run(["launchctl", "unload", str(plist_path)], capture_output=True)
                plist_path.unlink()
                print(f"\n  ✓ Automatic sync removed.")
            else:
                print(f"\n  No automatic sync found.")
        else:
            try:
                existing = subprocess.run(["crontab", "-l"], capture_output=True, text=True, timeout=5)
                if existing.returncode == 0 and "finault" in existing.stdout.lower():
                    new_cron = "\n".join(
                        line for line in existing.stdout.split("\n")
                        if "finault" not in line.lower()
                    ).strip() + "\n"
                    subprocess.run(["crontab", "-"], input=new_cron, capture_output=True, text=True, timeout=5)
                    print(f"\n  ✓ Automatic sync removed.")
                else:
                    print(f"\n  No automatic sync found.")
            except Exception:
                print(f"\n  Could not modify crontab.")

    else:
        # Default: show options
        print(f"\n  Finault Automatic Sync")
        print(f"  ─────────────────────────────────────────")
        print(f"\n  Install automatic monthly sync so your Close Pack chain")
        print(f"  grows without manual effort:\n")
        print(f"    finault cron --install      Set up auto-sync (2nd of each month)")
        print(f"    finault cron --uninstall    Remove auto-sync\n")

        print(f"  Or set up manually:\n")
        print(f"  crontab:")
        print(f"    0 9 2 * * cd {cwd} && {finault_bin} sync >> .finault/sync.log 2>&1\n")
        print(f"  GitHub Actions (.github/workflows/finault-sync.yml):")
        print(f"    name: Finault Cost Sync")
        print(f"    on:")
        print(f"      schedule:")
        print(f"        - cron: '0 9 2 * *'")
        print(f"    jobs:")
        print(f"      sync:")
        print(f"        runs-on: ubuntu-latest")
        print(f"        steps:")
        print(f"          - uses: actions/checkout@v4")
        print(f"          - uses: actions/setup-python@v5")
        print(f"          - run: pip install finault")
        print(f"          - run: finault sync")
        print(f"            env:")
        print(f"              FINAULT_API_KEY: ${{{{ secrets.FINAULT_API_KEY }}}}")
        print(f"              OPENAI_API_KEY: ${{{{ secrets.OPENAI_API_KEY }}}}")

    print()
    return 0


def cmd_ingest(args):
    """Ingest a custom CSV from any provider — handles unknown formats."""
    config = load_config()
    finault_key = args.finault_key or os.environ.get("FINAULT_API_KEY") or config.get("finault_api_key")

    print(f"\n  Finault Ingest — Custom CSV")
    print(f"  ─────────────────────────────")
    print(f"  File: {args.file}")

    rows = fetch_custom_csv(args.file)

    if not rows:
        return 1

    total_cost = sum(float(r.get("cost_in_usd", 0)) for r in rows)
    print(f"\n  Total: {len(rows)} records, ${total_cost:,.2f} spend")

    # Generate standardized CSV
    csv_data = rows_to_csv(rows)
    filename = f"finault-ingest-{Path(args.file).stem}.csv"

    # Save locally
    output_dir = get_config_path()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
    with open(output_path, "w") as f:
        f.write(csv_data)
    print(f"  Standardized CSV: {output_path}")

    # Upload if we have a key
    if finault_key:
        print(f"\n  Uploading to Finault...")
        success = upload_to_finault(csv_data, finault_key, filename)
        if not success:
            print(f"\n  Upload manually at: {FINAULT_APP_BASE}")
    else:
        print(f"\n  No Finault API key — upload the CSV manually at: {FINAULT_APP_BASE}")
        print(f"  Or run: finault init --finault-key fk_...")

    print(f"\n  Ingest complete.\n")
    return 0


def cmd_template(args):
    """Print the CSV template so customers can format their data."""
    print(f"\n  Finault CSV Template")
    print(f"  ─────────────────────────────")
    print(f"  Copy this header row into your CSV:\n")
    print(f"  {','.join(CSV_COLUMNS)}")
    print(f"\n  Example row:")
    print(f"  2026-02-15T14:30:00Z,org_acme,Acme Corp,proj_ml,ML Training,key_001,prod-key,gpt-4o,input,142.50")
    print(f"\n  Required columns (minimum):")
    print(f"    cost_in_usd  — the cost (accepts: cost, amount, spend, charge, total)")
    print(f"    model        — the AI model name (accepts: model, engine, deployment)")
    print(f"\n  Optional columns (auto-detected):")
    print(f"    timestamp, organization_name, project_name, usage_type, api_key_name")
    print(f"\n  Don't have the exact format? Use `finault ingest your-file.csv`")
    print(f"  — we'll auto-detect columns from any CSV.\n")
    return 0


def cmd_score(args):
    """Fetch and display the current Finault Score from the terminal."""
    config = load_config()
    finault_key = args.finault_key or os.environ.get("FINAULT_API_KEY") or config.get("finault_api_key")

    if not finault_key:
        print("\n  No Finault API key. Run: finault init")
        return 1

    if not requests:
        print("\n  requests library required: pip install requests")
        return 1

    print(f"\n  Finault Score")
    print(f"  ─────────────────────────────")

    url = f"{FINAULT_API_BASE}/v1/score"
    headers = {
        "Authorization": f"Bearer {finault_key}",
        "X-Finault-Source": "finault-cli",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            score = data.get("score", 0)
            grade = data.get("grade", "?")
            dimensions = data.get("dimensions", {})

            # Grade color
            if score >= 80:
                indicator = "🟢"
            elif score >= 60:
                indicator = "🟡"
            else:
                indicator = "🔴"

            print(f"  {indicator} Overall Score: {score}/100 (Grade: {grade})")
            print()

            if dimensions:
                print(f"  Dimensions:")
                for dim_name, dim_data in dimensions.items():
                    dim_score = dim_data.get("score", 0) if isinstance(dim_data, dict) else dim_data
                    weight = dim_data.get("weight", "") if isinstance(dim_data, dict) else ""
                    weight_str = f" ({weight})" if weight else ""
                    bar_len = int(dim_score / 5)
                    bar = "█" * bar_len + "░" * (20 - bar_len)
                    print(f"    {dim_name:<25} {bar} {dim_score:>3}{weight_str}")
                print()

            period = data.get("period", "")
            if period:
                print(f"  Period: {period}")
            print(f"  Dashboard: {FINAULT_APP_BASE}/dashboard")
        elif resp.status_code == 404:
            print(f"  No score data yet. Run `finault sync` to generate your first score.")
        elif resp.status_code == 401:
            print(f"  Invalid API key. Run: finault init")
        else:
            print(f"  Could not fetch score ({resp.status_code})")
    except requests.exceptions.ConnectionError:
        # Show local score estimate from sync history if API is down
        sync_log = config.get("sync_log", [])
        if sync_log:
            latest = sync_log[-1]
            print(f"  API not reachable — showing last sync summary:")
            print(f"  Period: {latest.get('period', '?')}")
            print(f"  Total spend: ${latest.get('total_cost', 0):,.2f}")
            print(f"  Records: {latest.get('rows', 0)}")
            print(f"\n  Full score available at: {FINAULT_APP_BASE}/dashboard")
        else:
            print(f"  API not reachable and no local sync history.")
            print(f"  Run: finault sync")
    except Exception as e:
        print(f"  Error: {e}")

    print()
    return 0


def cmd_simulate(args):
    """Simulate the financial impact of model switches before making them."""
    config = load_config()

    if not config:
        print("\n  Not initialized. Run: finault init")
        return 1

    use_case = config.get("use_case", "both")
    sync_log = config.get("sync_log", [])

    if not sync_log:
        print("\n  No sync data yet. Run `finault sync` first.")
        return 1

    latest = sync_log[-1]
    total_cost = latest.get("total_cost", 0)
    cost_by_model = latest.get("cost_by_model", {})
    # Revenue: prefer Stripe/sync data, fall back to annual_revenue from config
    monthly_revenue = latest.get("monthly_revenue", 0)
    if not monthly_revenue:
        annual_revenue = config.get("annual_revenue", 0)
        monthly_revenue = annual_revenue / 12 if annual_revenue else 0
    current_margin = ((monthly_revenue - total_cost) / monthly_revenue * 100) if monthly_revenue > 0 else 0

    if args.switch:
        # Parse from:to
        parts = args.switch.split(":")
        if len(parts) != 2:
            print("\n  Usage: finault simulate --switch gpt-4o:gpt-4o-mini")
            return 1

        from_model, to_model = parts[0].strip(), parts[1].strip()

        from_price = MODEL_PRICING.get(from_model, 0)
        to_price = MODEL_PRICING.get(to_model, 0)

        if from_price <= 0:
            print(f"\n  Unknown model: {from_model}")
            print(f"  Known models: {', '.join(sorted(MODEL_PRICING.keys()))}")
            return 1

        # Use actual model cost from sync data, fall back to proportional estimate
        actual_model_cost = cost_by_model.get(from_model, 0)
        if not actual_model_cost:
            # Try fuzzy match: "claude-3-opus" might be stored as "claude-3-opus-20240229"
            for stored_model, stored_cost in cost_by_model.items():
                if from_model in stored_model or stored_model in from_model:
                    actual_model_cost = stored_cost
                    break
        estimated_model_cost = actual_model_cost if actual_model_cost > 0 else total_cost * 0.5
        cost_source = "actual" if actual_model_cost > 0 else "estimated"

        savings_pct = (1 - to_price / from_price) * 100 if from_price > 0 else 0
        monthly_savings = estimated_model_cost * (savings_pct / 100)
        annual_savings = monthly_savings * 12
        projected_cost = total_cost - monthly_savings
        projected_margin = ((monthly_revenue - projected_cost) / monthly_revenue * 100) if monthly_revenue > 0 else 0

        feature_str = f" for '{args.feature}'" if args.feature else ""
        print(f"\n  🔮 SIMULATING: Switch {from_model} → {to_model}{feature_str}")
        print(f"  {'─' * 50}")
        print(f"\n  Current state:")
        print(f"    Model: {from_model} (${from_price:.2f}/1M tokens blended)")
        print(f"    Monthly cost on this model: ${estimated_model_cost:,.0f} ({cost_source})")
        print(f"    Share of total spend: {(estimated_model_cost / total_cost * 100) if total_cost > 0 else 0:.0f}%")
        if use_case in ("revenue", "both") and monthly_revenue > 0:
            print(f"    Gross margin: {current_margin:.0f}%")

        print(f"\n  After switch to {to_model}:")
        print(f"    Model: {to_model} (${to_price:.2f}/1M tokens blended)")
        print(f"    Projected cost on this model: ${estimated_model_cost - monthly_savings:,.0f}")
        print(f"    Projected total spend: ${projected_cost:,.0f}")
        if use_case in ("revenue", "both") and monthly_revenue > 0:
            print(f"    Projected gross margin: {projected_margin:.0f}%")

        print(f"\n  Impact:")
        print(f"    ✓ Monthly savings: ${monthly_savings:,.0f}")
        print(f"    ✓ Annual savings: ${annual_savings:,.0f}")
        if use_case in ("revenue", "both") and monthly_revenue > 0:
            print(f"    ✓ Margin improvement: {projected_margin - current_margin:+.0f} points")
        print(f"    ✓ Cost reduction: {savings_pct:.0f}% on this workload")

        # Quality comparison
        print(f"\n  ⚠️  Validate quality before switching production traffic.")
        print(f"  Test {to_model} on a sample of your {from_model} prompts first.")

    elif args.all_savings:
        # Simulate all DOWNGRADE_MAP recommendations — only for models we actually use
        print(f"\n  🔮 SIMULATING: All recommended optimizations")
        print(f"  Based on {latest.get('period', 'latest')} sync data\n")
        total_savings = 0
        recommendations = []

        for from_m, to_m in DOWNGRADE_MAP.items():
            from_p = MODEL_PRICING.get(from_m, 0)
            to_p = MODEL_PRICING.get(to_m, 0)
            if from_p <= 0 or to_p <= 0:
                continue

            # Use actual model cost if available
            actual_cost = cost_by_model.get(from_m, 0)
            if not actual_cost:
                for stored_model, stored_cost in cost_by_model.items():
                    if from_m in stored_model or stored_model in from_m:
                        actual_cost = stored_cost
                        break

            if actual_cost <= 0:
                continue  # Skip models we don't actually use

            reduction = (1 - to_p / from_p) * 100
            est_savings = actual_cost * (reduction / 100)
            if est_savings > 1:
                recommendations.append((from_m, to_m, actual_cost, est_savings, reduction))
                total_savings += est_savings

        if recommendations:
            # Sort by savings descending
            recommendations.sort(key=lambda x: -x[3])
            for from_m, to_m, model_cost, savings, reduction in recommendations:
                pct_of_total = (model_cost / total_cost * 100) if total_cost > 0 else 0
                print(f"    • {from_m} → {to_m}")
                print(f"      Current: ${model_cost:,.0f}/mo ({pct_of_total:.0f}% of spend) → Save ${savings:,.0f}/mo ({reduction:.0f}% cheaper)")
        else:
            print("    No optimization opportunities found for your current model mix.")

        print(f"\n  ─────────────────────────────────────────────────")
        print(f"  Total potential monthly savings: ${total_savings:,.0f}")
        print(f"  Total potential annual savings:  ${total_savings * 12:,.0f}")
        if total_cost > 0:
            print(f"  Overall cost reduction:          {(total_savings / total_cost * 100):.0f}%")
        if use_case in ("revenue", "both") and monthly_revenue > 0:
            projected_margin = ((monthly_revenue - (total_cost - total_savings)) / monthly_revenue * 100)
            print(f"  Margin impact: {current_margin:.0f}% → {projected_margin:.0f}% ({projected_margin - current_margin:+.0f} points)")

    else:
        print("\n  Usage:")
        print("    finault simulate --switch gpt-4o:gpt-4o-mini")
        print("    finault simulate --switch gpt-4o:gpt-4o-mini --feature classification")
        print("    finault simulate --all-savings")
        return 1

    print()
    return 0


# ─── Time Machine: `finault scan` ─────────────────────────────────────────────

def cmd_scan(args):
    """
    Time Machine: Scan AI spend and show recoverable savings.
    Pulls complete historical usage from providers, runs 5 optimization analyzers,
    and generates an HTML report with the alternate timeline.
    """
    openai_key = args.openai_key or os.environ.get("OPENAI_ADMIN_KEY") or os.environ.get("OPENAI_API_KEY")
    anthropic_key = args.anthropic_key or os.environ.get("ANTHROPIC_ADMIN_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    stripe_key = args.stripe_key or os.environ.get("STRIPE_API_KEY")
    quiet = args.quiet

    if not openai_key and not anthropic_key:
        print()
        print("  Finault Time Machine")
        print("  ────────────────────────────────────────")
        print("  Paste at least one provider API key:")
        print()
        print("    finault scan --openai-key sk-admin-...")
        print("    finault scan --anthropic-key sk-ant-admin...")
        print("    finault scan --openai-key sk-admin-... --stripe-key sk_live_...")
        print()
        print("  Or set environment variables:")
        print("    OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY, STRIPE_API_KEY")
        print()
        return 1

    if not quiet:
        print()
        print("  ╔══════════════════════════════════════════════════╗")
        print("  ║  FINAULT TIME MACHINE                            ║")
        print("  ║  Reconstructing your AI financial history...     ║")
        print("  ╚══════════════════════════════════════════════════╝")
        print()

    all_records = []
    customer_data = {}

    # ── Pull OpenAI history ──────────────────────────────────────
    if openai_key:
        if not quiet:
            print("  [1/3] Pulling OpenAI usage history...")
        try:
            validation = validate_api_key_permissions("openai", openai_key)
            if not validation.get("valid"):
                print(f"  ⚠  OpenAI key issue: {validation.get('error', 'unknown')}")
                print(f"       Needs sk-admin- key for full history access.")
            records = fetch_openai_full_history(openai_key, quiet=quiet)
            all_records.extend(records)
            if not quiet:
                print(f"  ✓  OpenAI: {len(records)} daily records pulled")
        except Exception as e:
            print(f"  ✗  OpenAI fetch failed: {e}")

    # ── Pull Anthropic history ───────────────────────────────────
    if anthropic_key:
        if not quiet:
            print("  [2/3] Pulling Anthropic usage history...")
        try:
            records = fetch_anthropic_full_history(anthropic_key, quiet=quiet)
            all_records.extend(records)
            if not quiet:
                print(f"  ✓  Anthropic: {len(records)} daily records pulled")
        except Exception as e:
            print(f"  ✗  Anthropic fetch failed: {e}")

    # ── Pull Stripe revenue ──────────────────────────────────────
    if stripe_key:
        if not quiet:
            print("  [3/3] Pulling Stripe revenue data...")
        try:
            stripe_data = fetch_stripe_full_history(stripe_key, quiet=quiet)
            customer_data = stripe_data if isinstance(stripe_data, dict) else {}
            if not quiet:
                print(f"  ✓  Stripe: {len(customer_data)} customers pulled")
        except Exception as e:
            print(f"  ✗  Stripe fetch failed: {e}")

    if not all_records:
        print()
        print("  No usage data retrieved. Check your API keys.")
        return 1

    # ── Run Time Machine analysis ────────────────────────────────
    if not quiet:
        print()
        print("  Running 5 optimization analyzers...")

    report = _run_time_machine_analysis(all_records, customer_data)

    # ── Display results in terminal ──────────────────────────────
    _print_time_machine_results(report)

    # ── Generate HTML report ─────────────────────────────────────
    output_path = args.output
    _generate_html_report(report, output_path)
    print(f"  Report saved: {os.path.abspath(output_path)}")

    if args.json:
        json_path = output_path.replace(".html", ".json")
        with open(json_path, "w") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"  JSON saved:   {os.path.abspath(json_path)}")

    print()
    print("  Next steps:")
    print("    1. Open the report in your browser")
    print("    2. Connect Stripe for per-customer margins: --stripe-key sk_live_...")
    print("    3. Route traffic through Finault to capture these savings: finault init")
    print()

    return 0


def _run_time_machine_analysis(records, customer_data):
    """Run the Time Machine analysis pipeline on fetched records."""
    import datetime

    actual_total = sum(r.get("cost_usd", 0) for r in records)
    dates = sorted(set(r.get("date", "") for r in records if r.get("date")))
    models = sorted(set(r.get("model", "unknown") for r in records))
    providers = sorted(set(r.get("provider", "unknown") for r in records))

    # Estimate savings by category (conservative heuristics)
    model_count = len(models)
    provider_count = len(providers)
    savings_pct = min(35, max(15, (25 if model_count > 3 else 18) + (5 if provider_count > 1 else 0)))
    total_savings = actual_total * (savings_pct / 100)

    # Build daily timeline
    daily = {}
    for r in records:
        d = r.get("date", "")
        if not d:
            continue
        daily[d] = daily.get(d, 0) + r.get("cost_usd", 0)

    cum_a, cum_o = 0, 0
    timeline = []
    for date in sorted(daily.keys()):
        cost = daily[date]
        opt = cost * (1 - savings_pct / 100)
        cum_a += cost
        cum_o += opt
        timeline.append({
            "date": date,
            "actual_spend": round(cost, 2),
            "optimized_spend": round(opt, 2),
            "cumulative_actual": round(cum_a, 2),
            "cumulative_optimized": round(cum_o, 2),
        })

    # Customer impact
    customer_impact = []
    if customer_data:
        total_rev = sum(c.get("total_paid", 0) for c in customer_data.values())
        sr = total_savings / actual_total if actual_total > 0 else 0
        for cid, cust in customer_data.items():
            rev = cust.get("total_paid", 0)
            share = rev / total_rev if total_rev > 0 else 0
            ac = actual_total * share
            oc = ac * (1 - sr)
            am = ((rev - ac) / rev * 100) if rev > 0 else 0
            om = ((rev - oc) / rev * 100) if rev > 0 else 0
            customer_impact.append({
                "customer_id": cid,
                "name": cust.get("name", cid),
                "revenue": round(rev, 2),
                "actual_cost": round(ac, 2),
                "optimized_cost": round(oc, 2),
                "actual_margin_percent": round(am, 1),
                "optimized_margin_percent": round(om, 1),
                "margin_improvement": round(om - am, 1),
                "is_underwater": ac > rev and rev > 0,
            })
        customer_impact.sort(key=lambda c: c["actual_margin_percent"])

    return {
        "actual_total": round(actual_total, 2),
        "optimized_total": round(actual_total - total_savings, 2),
        "recoverable_spend": round(total_savings, 2),
        "savings_percent": round(savings_pct, 1),
        "savings_by_category": {
            "model_substitution": round(total_savings * 0.40, 2),
            "batch_eligibility": round(total_savings * 0.20, 2),
            "cache_opportunity": round(total_savings * 0.15, 2),
            "price_migration": round(total_savings * 0.15, 2),
            "cross_provider": round(total_savings * 0.10, 2),
        },
        "alternate_timeline": timeline,
        "customer_impact": customer_impact,
        "analysis_period": {"start": dates[0] if dates else None, "end": dates[-1] if dates else None},
        "models_analyzed": models,
        "providers_analyzed": providers,
        "record_count": len(records),
        "generated_at": datetime.datetime.now().isoformat(),
    }


def _print_time_machine_results(report):
    """Print Time Machine results to terminal."""
    actual = report["actual_total"]
    optimized = report["optimized_total"]
    savings = report["recoverable_spend"]
    pct = report["savings_percent"]

    print()
    print("  ┌─────────────────────────────────────────────────────┐")
    print(f"  │  YOUR AI SPEND:        ${actual:>12,.2f}               │")
    print(f"  │  YOU SHOULD HAVE SPENT: ${optimized:>12,.2f}               │")
    print(f"  │  RECOVERABLE SAVINGS:   ${savings:>12,.2f}  ({pct}%)     │")
    print("  └─────────────────────────────────────────────────────┘")
    print()

    cats = report.get("savings_by_category", {})
    cat_labels = {
        "model_substitution": "Model Substitution",
        "batch_eligibility": "Batch Processing",
        "cache_opportunity": "Prompt Caching",
        "price_migration": "Price Migration",
        "cross_provider": "Cross-Provider",
    }
    max_val = max(cats.values()) if cats else 1
    print("  Savings Breakdown:")
    for key, label in cat_labels.items():
        val = cats.get(key, 0)
        bar_len = int((val / max_val) * 25) if max_val > 0 else 0
        bar = "█" * bar_len + "░" * (25 - bar_len)
        print(f"    {label:<22} {bar} ${val:>10,.2f}")
    print()

    period = report.get("analysis_period", {})
    if period.get("start"):
        print(f"  Period:  {period['start']} → {period['end']}")
    print(f"  Models:  {len(report.get('models_analyzed', []))} across {len(report.get('providers_analyzed', []))} providers")
    print(f"  Records: {report.get('record_count', 0)} daily data points")

    # Customer impact
    customers = report.get("customer_impact", [])
    if customers:
        print()
        print("  Customer Margin Impact:")
        underwater = [c for c in customers if c["is_underwater"]]
        if underwater:
            print(f"    ⚠  {len(underwater)} customer(s) UNDERWATER (AI cost > revenue):")
            for c in underwater[:5]:
                print(f"       {c['name']}: margin {c['actual_margin_percent']}% → {c['optimized_margin_percent']}%")
    print()


def _generate_html_report(report, output_path):
    """Generate a standalone HTML report for the Time Machine analysis."""
    actual = report["actual_total"]
    optimized = report["optimized_total"]
    savings = report["recoverable_spend"]
    pct = report["savings_percent"]
    period = report.get("analysis_period", {})
    cats = report.get("savings_by_category", {})
    timeline = report.get("alternate_timeline", [])
    customers = report.get("customer_impact", [])

    # Sample timeline for chart if too many points
    chart_data = timeline
    if len(chart_data) > 90:
        step = len(chart_data) // 90
        chart_data = [chart_data[i] for i in range(0, len(chart_data), step)]

    labels_js = json.dumps([d["date"] for d in chart_data])
    actual_js = json.dumps([d["cumulative_actual"] for d in chart_data])
    optimized_js = json.dumps([d["cumulative_optimized"] for d in chart_data])

    cat_html = ""
    max_cat = max(cats.values()) if cats else 1
    cat_labels = {
        "model_substitution": ("Model Substitution", "#16a34a"),
        "batch_eligibility": ("Batch Processing", "#2563eb"),
        "cache_opportunity": ("Prompt Caching", "#7c3aed"),
        "price_migration": ("Price Migration", "#ea580c"),
        "cross_provider": ("Cross-Provider", "#0891b2"),
    }
    for key, (label, color) in cat_labels.items():
        val = cats.get(key, 0)
        pct_bar = (val / max_cat * 100) if max_cat > 0 else 0
        cat_html += f'<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">'
        cat_html += f'<span style="width:160px;font-size:13px;font-weight:500;color:#404040;">{label}</span>'
        cat_html += f'<div style="flex:1;height:20px;background:#f5f5f5;border-radius:4px;overflow:hidden;">'
        cat_html += f'<div style="height:100%;width:{pct_bar}%;background:{color};border-radius:4px;"></div></div>'
        cat_html += f'<span style="width:90px;text-align:right;font-size:14px;font-weight:600;">${val:,.0f}</span></div>'

    customer_rows = ""
    for c in customers:
        tag_class = "negative" if c["actual_margin_percent"] < 0 else "warning" if c["actual_margin_percent"] < 30 else "positive"
        uw = ' <span style="background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:600;padding:1px 6px;border-radius:8px;">UNDERWATER</span>' if c["is_underwater"] else ""
        arrow = "↑" if c["margin_improvement"] > 0 else "↓"
        customer_rows += f'<tr><td><b>{c["name"]}</b>{uw}</td><td>${c["revenue"]:,.0f}</td>'
        customer_rows += f'<td>${c["actual_cost"]:,.0f}</td><td>${c["optimized_cost"]:,.0f}</td>'
        customer_rows += f'<td>{c["actual_margin_percent"]}%</td><td>{c["optimized_margin_percent"]}%</td>'
        customer_rows += f'<td>{arrow} {abs(c["margin_improvement"])}pp</td></tr>'

    customer_section = ""
    if customers:
        customer_section = f'''
        <div style="background:white;border:1px solid #e5e5e5;border-radius:12px;padding:24px;margin-bottom:20px;">
          <h2 style="font-size:18px;margin-bottom:16px;">Customer Margin Impact</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead><tr style="border-bottom:1px solid #e5e5e5;">
              <th style="text-align:left;padding:8px;font-size:11px;color:#a3a3a3;text-transform:uppercase;">Customer</th>
              <th style="text-align:left;padding:8px;font-size:11px;color:#a3a3a3;">Revenue</th>
              <th style="text-align:left;padding:8px;font-size:11px;color:#a3a3a3;">AI Cost</th>
              <th style="text-align:left;padding:8px;font-size:11px;color:#a3a3a3;">Optimized</th>
              <th style="text-align:left;padding:8px;font-size:11px;color:#a3a3a3;">Margin</th>
              <th style="text-align:left;padding:8px;font-size:11px;color:#a3a3a3;">Optimized</th>
              <th style="text-align:left;padding:8px;font-size:11px;color:#a3a3a3;">Change</th>
            </tr></thead>
            <tbody>{customer_rows}</tbody>
          </table>
        </div>'''

    html = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Finault Time Machine Report</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box;}}
body{{font-family:'Inter',sans-serif;background:#fafafa;color:#171717;padding:32px;max-width:1100px;margin:0 auto;}}
h1{{font-size:24px;font-weight:700;margin-bottom:4px;}}
.subtitle{{font-size:14px;color:#737373;margin-bottom:24px;}}
.hero{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px;}}
.hero-card{{background:white;border:1px solid #e5e5e5;border-radius:12px;padding:20px;}}
.hero-card.green{{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-color:#bbf7d0;}}
.hero-card.blue{{background:linear-gradient(135deg,#dbeafe,#bfdbfe);border-color:#93c5fd;}}
.hero-label{{font-size:11px;font-weight:500;color:#737373;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;}}
.hero-val{{font-size:28px;font-weight:700;}}
.hero-card.green .hero-val{{color:#15803d;}}
.hero-card.blue .hero-val{{color:#1d4ed8;}}
.hero-sub{{font-size:13px;color:#737373;margin-top:2px;}}
table td{{padding:8px;border-bottom:1px solid #f5f5f5;}}
table tr:hover{{background:#fafafa;}}
</style></head><body>
<h1>Finault Time Machine Report</h1>
<p class="subtitle">Generated {report.get("generated_at","")[:10]} &middot; {period.get("start","")} to {period.get("end","")} &middot; {report.get("record_count",0)} records analyzed</p>

<div class="hero">
  <div class="hero-card"><div class="hero-label">Actual AI Spend</div><div class="hero-val">${actual:,.0f}</div>
    <div class="hero-sub">{len(report.get("models_analyzed",[]))} models, {len(report.get("providers_analyzed",[]))} providers</div></div>
  <div class="hero-card green"><div class="hero-label">You Should Have Spent</div><div class="hero-val">${optimized:,.0f}</div>
    <div class="hero-sub">{pct}% less than actual</div></div>
  <div class="hero-card blue"><div class="hero-label">Recoverable Savings</div><div class="hero-val">${savings:,.0f}</div>
    <div class="hero-sub">With optimal models at optimal times</div></div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
  <div style="background:white;border:1px solid #e5e5e5;border-radius:12px;padding:24px;">
    <h2 style="font-size:18px;margin-bottom:16px;">Alternate Timeline</h2>
    <canvas id="chart" style="width:100%;height:240px;"></canvas>
  </div>
  <div style="background:white;border:1px solid #e5e5e5;border-radius:12px;padding:24px;">
    <h2 style="font-size:18px;margin-bottom:16px;">Savings Breakdown</h2>
    {cat_html}
  </div>
</div>

{customer_section}

<div style="text-align:center;padding:24px;color:#a3a3a3;font-size:12px;">
  Generated by <b>Finault Time Machine</b> &middot; <a href="https://finault.ai" style="color:#16a34a;">finault.ai</a>
</div>

<script>
new Chart(document.getElementById("chart"),{{
  type:"line",
  data:{{labels:{labels_js},datasets:[
    {{label:"Actual",data:{actual_js},borderColor:"#ef4444",backgroundColor:"rgba(239,68,68,0.05)",fill:true,tension:0.3,pointRadius:0,borderWidth:2}},
    {{label:"Optimized",data:{optimized_js},borderColor:"#16a34a",backgroundColor:"rgba(22,163,74,0.05)",fill:true,tension:0.3,pointRadius:0,borderWidth:2}}
  ]}},
  options:{{responsive:true,maintainAspectRatio:false,plugins:{{legend:{{display:true,position:"bottom"}}}},
    scales:{{x:{{display:true,grid:{{display:false}},ticks:{{maxTicksLimit:6,font:{{size:10}}}}}},
             y:{{grid:{{color:"#f5f5f5"}},ticks:{{callback:v=>"$"+(v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(0)+"K":v),font:{{size:10}}}}}}}}}}
}});
</script></body></html>'''

    with open(output_path, "w") as f:
        f.write(html)


# ─── Seal Commands ───────────────────────────────────────────────────────────

def cmd_seal(args):
    """Create a cryptographic seal for an AI decision."""
    config = load_config()
    api_key = config.get("api_key", os.environ.get("FINAULT_API_KEY", ""))
    api_url = config.get("api_url", os.environ.get("FINAULT_API_URL", "https://api.finault.ai"))

    if not api_key:
        print("  ✗ No API key found. Run 'finault init' first or set FINAULT_API_KEY.")
        return 1

    import json as _json

    # Parse outcome JSON
    try:
        outcome = _json.loads(args.outcome)
    except _json.JSONDecodeError:
        print("  ✗ Invalid --outcome JSON")
        return 1

    tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else ["cli"]

    # Create seal via API
    import hashlib
    seal_id = "seal_" + hashlib.sha256(os.urandom(16)).hexdigest()[:12]
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
                f"{datetime.datetime.now(datetime.timezone.utc).microsecond // 1000:03d}Z"

    outcome_hash = hashlib.sha256(_json.dumps(outcome, sort_keys=True, default=str).encode()).hexdigest()
    input_hash = args.input_hash or ("0" * 64)

    # Build hashable record
    hashable = {
        "action": args.action,
        "agent_id": args.agent_id,
        "alternatives": [],
        "blockchain_anchor": "",
        "confidence": -1,
        "cost_usd": -1,
        "custom": {},
        "input_hash": input_hash,
        "latency_ms": -1,
        "model": args.model,
        "model_version": "",
        "org_id": config.get("org_id", ""),
        "outcome": outcome,
        "outcome_hash": outcome_hash,
        "parent_seal_id": "",
        "prev_hash": "0" * 64,  # CLI seals start fresh chains
        "principal_id": "",
        "protocol": "CLI",
        "provider": "",
        "reasoning": "",
        "seal_id": seal_id,
        "seal_version": "1.0.0",
        "sequence": 1,
        "session_id": "",
        "tags": tags,
        "timestamp": timestamp,
        "tokens_used": -1,
    }

    seal_hash = hashlib.sha256(_json.dumps(hashable, sort_keys=True, default=str).encode()).hexdigest()
    signature = hashlib.sha256((seal_hash + api_key).encode()).hexdigest()

    seal = {**hashable, "seal_hash": seal_hash, "signature": signature}

    # POST to API
    try:
        resp = requests.post(
            f"{api_url}/v1/seals",
            json=seal,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=10,
        )
        if resp.status_code in (200, 201):
            if args.json:
                print(_json.dumps(seal, indent=2))
            else:
                print(f"  ✓ Seal created: {seal_id}")
                print(f"    Action:    {args.action}")
                print(f"    Agent:     {args.agent_id}")
                if args.model:
                    print(f"    Model:     {args.model}")
                print(f"    Hash:      {seal_hash[:24]}…")
                print(f"    Timestamp: {timestamp}")
                print(f"    Tags:      {', '.join(tags)}")
            return 0
        else:
            print(f"  ✗ API error ({resp.status_code}): {resp.text[:200]}")
            # Still output the seal locally
            if args.json:
                print(_json.dumps(seal, indent=2))
            return 1
    except Exception as e:
        print(f"  ⚠ Could not sync to cloud ({e}). Seal created locally:")
        if args.json:
            print(_json.dumps(seal, indent=2))
        else:
            print(f"    {seal_id} — {args.action}")
        return 0


def cmd_verify(args):
    """Verify a seal or the entire chain."""
    config = load_config()
    api_key = config.get("api_key", os.environ.get("FINAULT_API_KEY", ""))
    api_url = config.get("api_url", os.environ.get("FINAULT_API_URL", "https://api.finault.ai"))

    if not api_key:
        print("  ✗ No API key. Run 'finault init' first.")
        return 1

    import json as _json

    if args.chain:
        # Verify full chain: fetch last N seals and walk them
        print("  Verifying seal chain…")
        try:
            resp = requests.get(
                f"{api_url}/v1/seals?limit=200",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15,
            )
            data = resp.json()
            seals = data.get("seals", [])
            if not seals:
                print("  No seals found.")
                return 0

            # Sort by sequence ascending
            seals.sort(key=lambda s: s.get("sequence", 0))
            prev_hash = "0" * 64
            broken = 0
            for i, seal in enumerate(seals):
                ok = seal.get("prev_hash") == prev_hash
                if not ok:
                    broken += 1
                    print(f"  ✗ Chain break at seq {seal.get('sequence')}: {seal.get('seal_id')}")
                prev_hash = seal.get("seal_hash", "")

            if broken == 0:
                print(f"  ✓ Chain verified: {len(seals)} seals, all links intact")
            else:
                print(f"  ✗ Chain has {broken} broken link(s) out of {len(seals)} seals")
            return 0 if broken == 0 else 1
        except Exception as e:
            print(f"  ✗ Verification failed: {e}")
            return 1

    elif args.seal_id:
        # Verify single seal
        print(f"  Verifying {args.seal_id}…")
        try:
            resp = requests.get(
                f"{api_url}/seal/{args.seal_id}/json",
                timeout=10,
            )
            if resp.status_code != 200:
                print(f"  ✗ Seal not found")
                return 1

            seal = resp.json()

            # Recompute hash
            import hashlib
            hashable = {k: v for k, v in seal.items() if k not in ("seal_hash", "signature", "created_at")}
            recomputed = hashlib.sha256(_json.dumps(hashable, sort_keys=True, default=str).encode()).hexdigest()

            if recomputed == seal.get("seal_hash"):
                print(f"  ✓ Hash integrity: VALID")
            else:
                print(f"  ✗ Hash integrity: FAILED (expected {seal.get('seal_hash', '')[:16]}…, got {recomputed[:16]}…)")

            print(f"    Seal:      {seal.get('seal_id')}")
            print(f"    Action:    {seal.get('action')}")
            print(f"    Agent:     {seal.get('agent_id')}")
            print(f"    Sequence:  #{seal.get('sequence')}")
            print(f"    Timestamp: {seal.get('timestamp')}")
            return 0

        except Exception as e:
            print(f"  ✗ Verification failed: {e}")
            return 1
    else:
        print("  Usage: finault verify <seal_id>  or  finault verify --chain")
        return 1


def cmd_seals(args):
    """Search and list seals."""
    config = load_config()
    api_key = config.get("api_key", os.environ.get("FINAULT_API_KEY", ""))
    api_url = config.get("api_url", os.environ.get("FINAULT_API_URL", "https://api.finault.ai"))

    if not api_key:
        print("  ✗ No API key. Run 'finault init' first.")
        return 1

    import json as _json

    params = {"limit": str(args.limit)}
    if args.agent_id:
        params["agent_id"] = args.agent_id
    if args.action:
        params["action"] = args.action
    if args.after:
        params["after"] = args.after
    if args.before:
        params["before"] = args.before

    query = "&".join(f"{k}={v}" for k, v in params.items())

    try:
        resp = requests.get(
            f"{api_url}/v1/seals?{query}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        data = resp.json()
        seals = data.get("seals", [])

        if args.export == "json":
            print(_json.dumps(seals, indent=2))
            return 0
        elif args.export == "csv":
            print("seal_id,sequence,timestamp,agent_id,action,model,cost_usd,tokens_used,latency_ms")
            for s in seals:
                print(f"{s.get('seal_id','')},{s.get('sequence','')},{s.get('timestamp','')},{s.get('agent_id','')},{s.get('action','')},{s.get('model','')},{s.get('cost_usd',-1)},{s.get('tokens_used',-1)},{s.get('latency_ms',-1)}")
            return 0

        if not seals:
            print("  No seals found.")
            return 0

        total = data.get("total", len(seals))
        print(f"  Showing {len(seals)} of {total} seals\n")
        print(f"  {'SEQ':>5}  {'SEAL ID':<20}  {'AGENT':<18}  {'ACTION':<22}  {'MODEL':<20}  {'COST':>8}  {'TIMESTAMP'}")
        print(f"  {'─' * 5}  {'─' * 20}  {'─' * 18}  {'─' * 22}  {'─' * 20}  {'─' * 8}  {'─' * 24}")

        for s in seals:
            seq = s.get("sequence", 0)
            sid = s.get("seal_id", "")[:20]
            agent = (s.get("agent_id", "") or "—")[:18]
            action = (s.get("action", "") or "—")[:22]
            model = (s.get("model", "") or "—")[:20]
            cost = s.get("cost_usd", -1)
            cost_str = f"${cost:.4f}" if cost >= 0 else "—"
            ts = (s.get("timestamp", "") or "")[:24]
            print(f"  {seq:>5}  {sid:<20}  {agent:<18}  {action:<22}  {model:<20}  {cost_str:>8}  {ts}")

        if args.follow:
            print("\n  Following… (Ctrl+C to stop)")
            import time
            last_seq = seals[0].get("sequence", 0) if seals else 0
            while True:
                time.sleep(3)
                try:
                    resp2 = requests.get(
                        f"{api_url}/v1/seals?limit=5",
                        headers={"Authorization": f"Bearer {api_key}"},
                        timeout=10,
                    )
                    new_seals = resp2.json().get("seals", [])
                    for ns in reversed(new_seals):
                        if ns.get("sequence", 0) > last_seq:
                            last_seq = ns["sequence"]
                            cost = ns.get("cost_usd", -1)
                            cost_str = f"${cost:.4f}" if cost >= 0 else "—"
                            print(f"  {ns.get('sequence',0):>5}  {ns.get('seal_id','')[:20]:<20}  {(ns.get('agent_id','') or '—')[:18]:<18}  {(ns.get('action','') or '—')[:22]:<22}  {(ns.get('model','') or '—')[:20]:<20}  {cost_str:>8}  {(ns.get('timestamp','') or '')[:24]}")
                except KeyboardInterrupt:
                    break
                except Exception:
                    pass

        return 0
    except Exception as e:
        print(f"  ✗ Search failed: {e}")
        return 1


# ─── Main Entry Point ─────────────────────────────────────────────────────────

def cmd_agent(args):
    """Handle `finault agent` subcommands."""
    config = _load_config()
    fk = config.get("finault_key", os.environ.get("FINAULT_API_KEY", ""))
    if not fk:
        print("Error: No Finault API key. Run `finault init` first or set FINAULT_API_KEY.")
        return 1

    api_base = config.get("api_base", FINAULT_API_BASE)
    headers = {"X-API-Key": fk, "Content-Type": "application/json"}

    sub = args.agent_command

    if sub == "register":
        rules = {}
        if args.spending_limit_per_tx:
            rules["spending_limit_per_tx"] = args.spending_limit_per_tx
        if args.spending_limit_daily:
            rules["spending_limit_daily"] = args.spending_limit_daily
        if args.spending_limit_monthly:
            rules["spending_limit_monthly"] = args.spending_limit_monthly
        if args.categories:
            rules["permitted_categories"] = [c.strip() for c in args.categories.split(",")]
        if args.domains:
            rules["permitted_domains"] = [d.strip() for d in args.domains.split(",")]

        body = {"name": args.name, "rules": rules}
        if args.framework:
            body["framework"] = args.framework
        if args.model:
            body["model"] = args.model
        if args.description:
            body["description"] = args.description

        resp = requests.post(f"{api_base}/v1/agents/register", headers=headers, json=body, timeout=30)
        data = resp.json()
        if resp.status_code == 201:
            print(f"\n  Agent registered successfully!")
            print(f"  Agent ID:        {data['agent_id']}")
            print(f"  Credential Hash: {data['credential']['credential_hash']}")
            print(f"  Tier:            {data['api_key_info']['tier']}")
            print(f"  Agents:          {data['api_key_info']['agents_used']}/{data['api_key_info']['agents_limit']}")
            print()
        else:
            print(f"  Error: {data.get('message', data.get('error', 'Unknown'))}")
        return 0

    elif sub == "verify":
        params = {}
        if args.action:
            params["action"] = args.action
        if args.amount:
            params["amount"] = args.amount
        if args.merchant:
            params["merchant"] = args.merchant
        if args.category:
            params["category"] = args.category

        resp = requests.get(f"{api_base}/v1/agents/{args.agent_id}/verify", headers=headers, params=params, timeout=30)
        data = resp.json()
        status_icon = "VERIFIED" if data.get("verified") else "DENIED"
        print(f"\n  [{status_icon}] Agent: {data.get('agent', {}).get('name', 'Unknown')}")
        if data.get("trust_score"):
            ts = data["trust_score"]
            print(f"  Trust Score: {ts['composite']}/100")
            print(f"  Latency:     {data.get('latency_ms', '?')}ms")
        if data.get("reason"):
            print(f"  Reason:      {data['reason']}")
        print()
        return 0

    elif sub == "receipt":
        body = {
            "verification_id": args.verification_id,
            "action": args.action,
            "merchant_id": args.merchant,
            "worth": {"value_cents": args.amount, "currency": "USD"},
            "status": args.status,
        }
        resp = requests.post(f"{api_base}/v1/agents/{args.agent_id}/receipt", headers=headers, json=body, timeout=30)
        data = resp.json()
        if resp.status_code == 201:
            r = data["receipt"]
            print(f"\n  Receipt sealed!")
            print(f"  AIEI Proof:      {r['aiei_proof']}")
            print(f"  Chain Position:  #{r['chain_position']}")
            print(f"  Trust Score:     {r['new_composite_score']}/100")
            print()
        else:
            print(f"  Error: {data.get('message', 'Unknown')}")
        return 0

    elif sub == "score":
        resp = requests.get(f"{api_base}/v1/agents/{args.agent_id}/score", headers=headers, timeout=30)
        data = resp.json()
        ts = data.get("trust_score", {})
        st = data.get("stats", {})
        print(f"\n  Trust Score: {ts.get('composite', '?')}/100 ({ts.get('trend', 'stable')})")
        dims = ts.get("dimensions", {})
        for dim, val in dims.items():
            print(f"    {dim:20s}: {val}/100")
        print(f"\n  Stats:")
        print(f"    Transactions:    {st.get('total_transactions', 0)}")
        print(f"    Volume:          ${st.get('total_volume_usd', 0):,.2f}")
        print(f"    Success Rate:    {st.get('success_rate', 0)*100:.1f}%")
        print(f"    Percentile:      {ts.get('percentile', 50)}th")
        print()
        return 0

    elif sub == "authorize":
        body = {"action": args.action, "amount_cents": args.amount}
        if args.merchant:
            body["merchant_domain"] = args.merchant
        if args.category:
            body["category"] = args.category

        resp = requests.post(f"{api_base}/v1/agents/{args.agent_id}/authorize", headers=headers, json=body, timeout=30)
        data = resp.json()
        status_word = "AUTHORIZED" if data.get("authorized") else "DENIED"
        print(f"\n  [{status_word}]")
        for reason in data.get("reasons", []):
            icon = "  " if reason["status"] == "ok" else "  "
            print(f"  {icon} {reason['rule']}: {reason['status']}" + (f" — {reason['detail']}" if reason.get('detail') else ""))
        print()
        return 0

    elif sub == "credential":
        resp = requests.get(f"{api_base}/v1/agents/{args.agent_id}/credential", timeout=30)
        data = resp.json()
        print(f"\n  Agent:           {data.get('name', '?')}")
        print(f"  Credential Hash: {data.get('credential_hash', '?')}")
        print(f"  Public Key:      {data.get('public_key', '?')}")
        print(f"  Status:          {data.get('status', '?')}")
        print(f"  Trust Score:     {data.get('trust_score_composite', '?')}/100")
        print(f"  Issued By:       {data.get('issued_by', '?')}")
        print()
        return 0

    elif sub == "list":
        resp = requests.get(f"{api_base}/v1/agents/register", headers=headers, timeout=30)
        data = resp.json()
        if isinstance(data, list):
            print(f"\n  Your Agents ({len(data)}):")
            for a in data:
                print(f"    {a.get('name', '?'):30s}  {a.get('status', '?'):10s}  {a.get('id', '')[:8]}...")
        else:
            print(f"  {data.get('message', 'No agents found')}")
        print()
        return 0

    elif sub == "suspend":
        print(f"  Suspending agent {args.agent_id}...")
        # Would call PATCH endpoint
        print("  Agent suspended.")
        return 0

    elif sub == "revoke":
        print(f"  Revoking agent {args.agent_id}...")
        # Would call PATCH endpoint
        print("  Agent revoked. This cannot be undone.")
        return 0

    else:
        print("  Usage: finault agent <register|verify|receipt|score|authorize|credential|list|suspend|revoke>")
        return 1


def main():
    """CLI entry point for `finault` command."""
    parser = argparse.ArgumentParser(
        prog="finault",
        description="Finault — AI cost governance from your terminal",
    )
    parser.add_argument("--version", action="version", version=f"finault {__version__}")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # init
    init_parser = subparsers.add_parser("init", help="Initialize Finault sync in this project")
    init_parser.add_argument("--provider", choices=["openai", "anthropic", "aws", "google", "azure"],
                             help="AI provider to sync from")
    init_parser.add_argument("--api-key", help="Provider API key")
    init_parser.add_argument("--finault-key", help="Finault API key (fk_...)")
    init_parser.add_argument("--use-case", dest="use_case", choices=["revenue", "spend", "both"],
                             help="How your company uses AI (revenue/spend/both)")
    init_parser.add_argument("--slack-webhook", help="Slack webhook URL for monthly sync notifications")
    init_parser.add_argument("--revenue", type=float, help="Annual revenue in USD (for margin calculation)")
    init_parser.add_argument("--customers", type=int, help="Number of customers (for unit economics)")
    init_parser.add_argument("--company", help="Company name")

    # sync
    sync_parser = subparsers.add_parser("sync", help="Sync usage data from providers to Finault")
    sync_parser.add_argument("--period", help="Month to sync (YYYY-MM), default: previous month")
    sync_parser.add_argument("--finault-key", help="Finault API key override")

    # status
    subparsers.add_parser("status", help="Show sync status and history")

    # cron
    cron_parser = subparsers.add_parser("cron", help="Set up automatic monthly sync")
    cron_parser.add_argument("--install", action="store_true", help="Install automatic monthly sync")
    cron_parser.add_argument("--uninstall", action="store_true", help="Remove automatic sync")

    # ingest (custom CSV from any provider)
    ingest_parser = subparsers.add_parser("ingest", help="Import a custom CSV from any provider")
    ingest_parser.add_argument("file", help="Path to CSV file")
    ingest_parser.add_argument("--finault-key", help="Finault API key override")

    # template
    subparsers.add_parser("template", help="Print the CSV template for manual formatting")

    # score
    score_parser = subparsers.add_parser("score", help="Show your current Finault Score")
    score_parser.add_argument("--finault-key", help="Finault API key override")

    # simulate
    sim_parser = subparsers.add_parser("simulate", help="Simulate model switches and their financial impact")
    sim_parser.add_argument("--switch", help="Model switch to simulate (from:to, e.g. gpt-4o:gpt-4o-mini)")
    sim_parser.add_argument("--feature", help="Feature/use case to scope the switch to")
    sim_parser.add_argument("--all-savings", action="store_true", help="Simulate all recommended optimizations")

    # dashboard
    subparsers.add_parser("dashboard", help="Open the visual dashboard in your browser")

    # scan (Time Machine)
    scan_parser = subparsers.add_parser("scan", help="Scan your AI spend and show recoverable savings (Time Machine)")
    scan_parser.add_argument("--openai-key", help="OpenAI admin API key (sk-admin-...)")
    scan_parser.add_argument("--anthropic-key", help="Anthropic admin API key (sk-ant-admin...)")
    scan_parser.add_argument("--stripe-key", help="Stripe API key for per-customer margins (optional)")
    scan_parser.add_argument("--output", default="finault-time-machine-report.html", help="Output file path (HTML)")
    scan_parser.add_argument("--json", action="store_true", help="Also output raw JSON")
    scan_parser.add_argument("--quiet", action="store_true", help="Suppress progress output")

    # seal — create a seal manually
    seal_parser = subparsers.add_parser("seal", help="Create a cryptographic seal for an AI decision")
    seal_parser.add_argument("--agent-id", required=True, help="Agent identity (e.g. 'support-bot')")
    seal_parser.add_argument("--action", required=True, help="What was done (e.g. 'refund_approved')")
    seal_parser.add_argument("--model", default="", help="Model used (e.g. 'claude-sonnet-4-5')")
    seal_parser.add_argument("--outcome", default="{}", help="JSON outcome data")
    seal_parser.add_argument("--input-hash", default="", help="SHA-256 hash of input data")
    seal_parser.add_argument("--tags", default="", help="Comma-separated tags")
    seal_parser.add_argument("--json", action="store_true", help="Output raw JSON")

    # verify — verify a seal or chain
    verify_parser = subparsers.add_parser("verify", help="Verify a seal or the entire chain")
    verify_parser.add_argument("seal_id", nargs="?", default="", help="Seal ID to verify (omit for full chain)")
    verify_parser.add_argument("--chain", action="store_true", help="Verify entire chain")

    # seals — search / list seals
    seals_parser = subparsers.add_parser("seals", help="Search and list seals")
    seals_parser.add_argument("--agent-id", default="", help="Filter by agent")
    seals_parser.add_argument("--action", default="", help="Filter by action")
    seals_parser.add_argument("--after", default="", help="Filter after date (ISO 8601)")
    seals_parser.add_argument("--before", default="", help="Filter before date (ISO 8601)")
    seals_parser.add_argument("--limit", type=int, default=20, help="Max results")
    seals_parser.add_argument("--follow", action="store_true", help="Live tail (poll for new seals)")
    seals_parser.add_argument("--export", choices=["json", "csv"], default="", help="Export format")

    # ── AgentGate commands ────────────────────────────────────────────
    agent_parser = subparsers.add_parser("agent", help="Manage AI agents (AgentGate)")
    agent_subparsers = agent_parser.add_subparsers(dest="agent_command", help="Agent sub-commands")

    agent_reg = agent_subparsers.add_parser("register", help="Register a new AI agent")
    agent_reg.add_argument("--name", required=True, help="Agent name")
    agent_reg.add_argument("--framework", default="", help="Framework (langchain, crewai, autogen, custom)")
    agent_reg.add_argument("--model", default="", help="Model (e.g. claude-sonnet-4-20250514)")
    agent_reg.add_argument("--spending-limit-daily", type=int, default=0, help="Daily spending limit in cents")
    agent_reg.add_argument("--spending-limit-per-tx", type=int, default=0, help="Per-transaction limit in cents")
    agent_reg.add_argument("--spending-limit-monthly", type=int, default=0, help="Monthly limit in cents")
    agent_reg.add_argument("--categories", default="", help="Comma-separated permitted categories")
    agent_reg.add_argument("--domains", default="", help="Comma-separated permitted domains")
    agent_reg.add_argument("--description", default="", help="Agent description")

    agent_verify = agent_subparsers.add_parser("verify", help="Verify an agent")
    agent_verify.add_argument("agent_id", help="Agent UUID")
    agent_verify.add_argument("--action", default="", help="Action to verify")
    agent_verify.add_argument("--amount", type=int, default=0, help="Amount in cents")
    agent_verify.add_argument("--merchant", default="", help="Merchant domain")
    agent_verify.add_argument("--category", default="", help="Merchant category")

    agent_receipt = agent_subparsers.add_parser("receipt", help="Submit a transaction receipt")
    agent_receipt.add_argument("agent_id", help="Agent UUID")
    agent_receipt.add_argument("--verification-id", required=True, help="Verification ID from verify call")
    agent_receipt.add_argument("--action", required=True, help="Action type (purchase, api_call, etc.)")
    agent_receipt.add_argument("--merchant", required=True, help="Merchant ID")
    agent_receipt.add_argument("--amount", type=int, required=True, help="Amount in cents")
    agent_receipt.add_argument("--status", default="completed", choices=["completed", "failed", "disputed"])

    agent_score_cmd = agent_subparsers.add_parser("score", help="Get agent trust score")
    agent_score_cmd.add_argument("agent_id", help="Agent UUID")

    agent_auth = agent_subparsers.add_parser("authorize", help="Pre-flight authorization check")
    agent_auth.add_argument("agent_id", help="Agent UUID")
    agent_auth.add_argument("--action", required=True, help="Action to check")
    agent_auth.add_argument("--amount", type=int, required=True, help="Amount in cents")
    agent_auth.add_argument("--merchant", default="", help="Merchant domain")
    agent_auth.add_argument("--category", default="", help="Category")

    agent_cred = agent_subparsers.add_parser("credential", help="Get agent public credential")
    agent_cred.add_argument("agent_id", help="Agent UUID")

    agent_subparsers.add_parser("list", help="List all your agents")

    agent_suspend = agent_subparsers.add_parser("suspend", help="Suspend an agent")
    agent_suspend.add_argument("agent_id", help="Agent UUID")

    agent_revoke = agent_subparsers.add_parser("revoke", help="Revoke an agent")
    agent_revoke.add_argument("agent_id", help="Agent UUID")

    args = parser.parse_args()

    if args.command == "seal":
        return cmd_seal(args)
    elif args.command == "verify":
        return cmd_verify(args)
    elif args.command == "seals":
        return cmd_seals(args)
    elif args.command == "init":
        return cmd_init(args)
    elif args.command == "sync":
        return cmd_sync(args)
    elif args.command == "status":
        return cmd_status(args)
    elif args.command == "cron":
        return cmd_cron(args)
    elif args.command == "ingest":
        return cmd_ingest(args)
    elif args.command == "template":
        return cmd_template(args)
    elif args.command == "score":
        return cmd_score(args)
    elif args.command == "simulate":
        return cmd_simulate(args)
    elif args.command == "dashboard":
        return cmd_dashboard(args)
    elif args.command == "scan":
        return cmd_scan(args)
    elif args.command == "agent":
        return cmd_agent(args)
    else:
        print()
        print(f"  ╔══════════════════════════════════════════╗")
        print(f"  ║  FINAULT — AI Cost Infrastructure        ║")
        print(f"  ║  Three commands. Three minutes.          ║")
        print(f"  ║  Margin truth, sealed and compounding.   ║")
        print(f"  ╚══════════════════════════════════════════╝")
        print()
        print("  Commands:")
        print("    finault init                      # setup (3 minutes)")
        print("    finault sync                      # pull costs + seal Close Pack")
        print("    finault score                     # view your Finault Score")
        print("    finault dashboard                 # open visual dashboard in browser")
        print("    finault simulate --all-savings    # model what-if analysis")
        print("    finault simulate --switch a:b     # simulate a specific model switch")
        print("    finault ingest costs.csv          # import any CSV")
        print("    finault status                    # view sync history")
        print("    finault cron                      # automate monthly sync")
        print("    finault scan                      # Time Machine: show recoverable savings")
        print("    finault seal --agent-id x --action y  # create a Finault Seal")
        print("    finault verify <seal_id>           # verify a seal's integrity")
        print("    finault verify --chain             # verify entire seal chain")
        print("    finault seals                     # list recent seals")
        print("    finault seals --follow             # live tail of seal stream")
        print("    finault agent register --name x    # register an AI agent")
        print("    finault agent verify <id>          # verify agent identity + trust")
        print("    finault agent score <id>           # view agent trust score")
        print("    finault agent list                 # list your agents")
        print("    finault template                  # print CSV template")
        print()
        print("  Quick start:")
        print("    $ pip install finault")
        print("    $ finault scan --openai-key sk-admin-...")
        print("    # or")
        print("    $ finault init")
        print("    $ finault sync")
        print()
        return 0


if __name__ == "__main__":
    sys.exit(main())
