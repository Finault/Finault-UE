"""
Dogfood test — run the insight engine on locally ingested CSV data.
Usage: python3 -m finault.dogfood path/to/csv
"""
import sys
import csv
from .sync import compute_top_savings, MODEL_PRICING
from .insights import generate_insights
from .benchmarks import generate_benchmark_section


# Simulated customer revenue allocations — models real SaaS dynamics:
# Most customers are profitable, but a few heavy-usage ones bleed margin.
# Total should roughly align with monthly_revenue ($400K).
CUSTOMER_REVENUE_MAP = {
    # project_name → (monthly_revenue, customer_count)
    "Clinical AI Assistant": (200_000, 8),   # $25K/cust avg — opus-heavy, top 2-3 unprofitable
    "Data Pipeline": (60_000, 6),            # $10K/cust — haiku is cheap, all profitable
    "Research Analytics": (80_000, 7),        # $11.4K/cust — opus makes top 1-2 unprofitable
    "Internal Tools": (60_000, 4),            # $15K/cust — cheap usage, all solidly profitable
}

# If a project isn't in the map, use this per-customer default
DEFAULT_MONTHLY_REVENUE_PER_CUSTOMER = 12_000


def _build_customer_margins(cost_by_team, total_monthly_revenue, total_customers):
    """
    Build per-customer margin breakdown from project cost centers.
    Maps each project to simulated customers with revenue allocation.
    """
    margin_by_customer = {}

    for project, project_cost in cost_by_team.items():
        rev_info = CUSTOMER_REVENUE_MAP.get(project)
        if rev_info:
            project_revenue, n_customers = rev_info
        else:
            n_customers = max(1, total_customers // max(len(cost_by_team), 1))
            project_revenue = n_customers * DEFAULT_MONTHLY_REVENUE_PER_CUSTOMER

        cost_per_customer = project_cost / n_customers
        rev_per_customer = project_revenue / n_customers

        # Create individual customer entries
        for i in range(n_customers):
            # Add variance: top customers use ~1.4x average, bottom ~0.6x
            variance = 1.0 + (i - n_customers / 2) * 0.10
            cust_cost = cost_per_customer * max(0.5, variance)
            cust_rev = rev_per_customer

            margin_pct = ((cust_rev - cust_cost) / cust_rev * 100) if cust_rev > 0 else -100

            # Generate realistic customer names
            cust_name = f"{project} – Cust #{i + 1}"
            margin_by_customer[cust_name] = {
                "cost": round(cust_cost, 2),
                "revenue": round(cust_rev, 2),
                "margin_pct": round(margin_pct, 1),
            }

    return margin_by_customer


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 -m finault.dogfood <csv-file>")
        return 1

    csv_path = sys.argv[1]

    # Read CSV
    rows = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if not rows:
        print("No data in CSV.")
        return 1

    # Aggregate
    total_cost = sum(float(r.get("cost_in_usd", 0)) for r in rows)
    cost_by_model = {}
    cost_by_provider = {}
    cost_by_team = {}
    for row in rows:
        model = row.get("model", "unknown")
        cost = float(row.get("cost_in_usd", 0))
        cost_by_model[model] = cost_by_model.get(model, 0) + cost
        provider = row.get("organization_name", row.get("organization_id", "unknown"))
        cost_by_provider[provider] = cost_by_provider.get(provider, 0) + cost
        team = row.get("project_name", row.get("project_id", "default"))
        cost_by_team[team] = cost_by_team.get(team, 0) + cost

    top_savings = compute_top_savings(rows)
    savings_list = [top_savings] if top_savings else []

    # Use revenue use case with $4.8M ARR, 25 customers
    # $400K/mo revenue against ~$263K/mo AI costs = ~34% margin (realistic)
    annual_revenue = 4_800_000
    monthly_revenue = annual_revenue / 12
    total_customers = 25
    use_case = "revenue"

    # Build per-customer margin breakdown from cost center data
    margin_by_customer = _build_customer_margins(cost_by_team, monthly_revenue, total_customers)

    insight_data = {
        "period": "January 2026",
        "total_cost": total_cost,
        "total_revenue": monthly_revenue,
        "annual_revenue": annual_revenue,
        "cost_by_model": cost_by_model,
        "cost_by_provider": cost_by_provider,
        "cost_by_cost_center": cost_by_team,
        "savings": savings_list,
        "margin_by_customer": margin_by_customer,
        "prior_period": {},
        "chain_depth": 1,
        "chain_hash": "a3f2e9c1b4d7f8a2e5c3d1b9f7a4e6c8d2b5f3a1c7e9d4b6f2a8c3e5d7b9f1a3",
        "finault_score": {
            "overall": 58,
            "grade": "C+",
            "dimensions": {
                "margin_health": {"score": 42},
                "unit_economics": {"score": 51},
                "cost_efficiency": {"score": 38},
                "trend_trajectory": {"score": 65},
                "governance_maturity": {"score": 85},
                "diversification": {"score": 35},
            },
        },
        "use_case": use_case,
    }

    print()
    print(generate_insights(insight_data, use_case))
    print(generate_benchmark_section(insight_data, use_case))
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
