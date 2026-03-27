"""
Finault Benchmarks — Static benchmark data from market research.

All data sourced from Finault market research (200+ sources, fact-checked).
Used by the insight engine to contextualize a company's AI spend and margins
against industry norms.

Sources:
  - Bessemer AI Index (Supernova, Shooting Star classifications)
  - CloudZero 2025 AI Spend Report
  - Anthropic/OpenAI published pricing
  - Industry surveys on AI cost forecasting accuracy
"""

from typing import Dict, Optional, Any


# ─── Bessemer AI Benchmarks ──────────────────────────────────────────────────

BESSEMER_BENCHMARKS = {
    "supernova": {
        "margin_avg": 25,
        "arr_year_1": 40_000_000,
        "arr_per_fte": 1_130_000,
        "description": "AI Supernova — hypergrowth, often negative margins",
    },
    "shooting_star": {
        "margin_avg": 60,
        "arr_year_1": 3_000_000,
        "arr_per_fte": 164_000,
        "description": "AI Shooting Star — fast growth with strong margins",
    },
    "traditional_saas": {
        "margin_avg": 80,
        "description": "Traditional SaaS benchmark",
    },
}


# ─── Industry AI Spend Benchmarks ────────────────────────────────────────────

INDUSTRY_BENCHMARKS = {
    "avg_monthly_ai_spend": 85521,  # CloudZero 2025
    "spend_by_stage": {
        "pre_seed": {"avg_monthly": 2000, "range": "500-5,000"},
        "seed": {"avg_monthly": 8500, "range": "2,000-25,000"},
        "series_a": {"avg_monthly": 23000, "range": "5,000-75,000"},
        "series_b": {"avg_monthly": 55000, "range": "15,000-150,000"},
        "series_c_plus": {"avg_monthly": 120000, "range": "30,000-500,000"},
    },
    "cost_forecast_accuracy": {
        "within_10pct": 15,   # Only 15% can forecast within +/-10%
        "miss_by_25pct_plus": 80,  # 80% miss by >25%
    },
    "margin_erosion": {
        "report_over_6pct": 84,  # 84% report >6% margin erosion from AI
    },
    "premium_model_overuse_avg": 15,  # % of spend on premium for simple tasks
    "ai_spend_as_pct_of_revenue_avg": 31.7,  # % — for companies using AI internally
}


# ─── Model Cost Benchmarks ──────────────────────────────────────────────────
# Average real-world cost per 1K tokens across the network
# Initially from published pricing, later enriched from Finault network data

MODEL_COST_BENCHMARKS = {
    # OpenAI
    "gpt-4o": {"avg_cost_per_1k": 0.005, "source": "published"},
    "gpt-4o-mini": {"avg_cost_per_1k": 0.000375, "source": "published"},
    "gpt-4-turbo": {"avg_cost_per_1k": 0.016, "source": "published"},
    "gpt-4.1": {"avg_cost_per_1k": 0.0038, "source": "published"},
    "gpt-4.1-mini": {"avg_cost_per_1k": 0.00076, "source": "published"},
    "gpt-4.1-nano": {"avg_cost_per_1k": 0.00019, "source": "published"},
    "o1": {"avg_cost_per_1k": 0.0285, "source": "published"},
    "o1-mini": {"avg_cost_per_1k": 0.0057, "source": "published"},
    "o3": {"avg_cost_per_1k": 0.0038, "source": "published"},
    "o3-mini": {"avg_cost_per_1k": 0.00209, "source": "published"},
    # Anthropic
    "claude-opus-4-5": {"avg_cost_per_1k": 0.011, "source": "published"},
    "claude-opus-4": {"avg_cost_per_1k": 0.033, "source": "published"},
    "claude-sonnet-4-5": {"avg_cost_per_1k": 0.0066, "source": "published"},
    "claude-sonnet-4": {"avg_cost_per_1k": 0.0066, "source": "published"},
    "claude-haiku-4-5": {"avg_cost_per_1k": 0.0022, "source": "published"},
    "claude-3.5-sonnet": {"avg_cost_per_1k": 0.0066, "source": "published"},
    "claude-3.5-haiku": {"avg_cost_per_1k": 0.00176, "source": "published"},
    # Google
    "gemini-2.5-pro": {"avg_cost_per_1k": 0.00388, "source": "published"},
    "gemini-2.5-flash": {"avg_cost_per_1k": 0.00116, "source": "published"},
    "gemini-2.0-flash": {"avg_cost_per_1k": 0.00019, "source": "published"},
    "gemini-1.5-pro": {"avg_cost_per_1k": 0.00238, "source": "published"},
    "gemini-1.5-flash": {"avg_cost_per_1k": 0.00014, "source": "published"},
    # Meta (hosted)
    "llama-3.1-405b": {"avg_cost_per_1k": 0.003, "source": "published"},
    "llama-3.1-70b": {"avg_cost_per_1k": 0.0009, "source": "published"},
    # DeepSeek
    "deepseek-v3": {"avg_cost_per_1k": 0.00052, "source": "published"},
    "deepseek-r1": {"avg_cost_per_1k": 0.00104, "source": "published"},
}


# ─── Benchmark Comparison Functions ──────────────────────────────────────────

def get_bessemer_comparison(margin_pct: float) -> str:
    """Compare margin against Bessemer tiers."""
    tiers = []
    for tier_name, tier_data in [
        ("AI Supernovas (Bessemer)", BESSEMER_BENCHMARKS["supernova"]),
        ("AI Shooting Stars (BVP)", BESSEMER_BENCHMARKS["shooting_star"]),
        ("Traditional SaaS", BESSEMER_BENCHMARKS["traditional_saas"]),
    ]:
        avg = tier_data["margin_avg"]
        diff = margin_pct - avg
        if diff >= 0:
            comp = f"you're {diff:.0f} pts above"
        else:
            comp = f"you're {abs(diff):.0f} pts below"
        tiers.append(f"  {tier_name:<30} ~{avg}% — {comp}")
    return "\n".join(tiers)


def get_stage_comparison(monthly_spend: float, stage: Optional[str] = None) -> str:
    """Compare spend against industry stage averages."""
    if not stage:
        stage = detect_stage(monthly_spend)

    stage_data = INDUSTRY_BENCHMARKS["spend_by_stage"].get(stage, {})
    avg = stage_data.get("avg_monthly", 0)
    range_str = stage_data.get("range", "?")

    if avg > 0:
        diff_pct = ((monthly_spend - avg) / avg) * 100
        if diff_pct > 0:
            comp = f"{diff_pct:.0f}% above average"
        else:
            comp = f"{abs(diff_pct):.0f}% below average"
        return f"  Avg {stage.replace('_', ' ').title()}: ${avg:,.0f}/mo (range: ${range_str}) — {comp}"
    return ""


def detect_stage(monthly_spend: float) -> str:
    """Guess the company stage from monthly AI spend."""
    if monthly_spend < 5000:
        return "pre_seed"
    elif monthly_spend < 15000:
        return "seed"
    elif monthly_spend < 50000:
        return "series_a"
    elif monthly_spend < 100000:
        return "series_b"
    else:
        return "series_c_plus"


def calculate_premium_overuse(cost_by_model: Dict[str, float]) -> float:
    """Calculate what percentage of spend goes to premium models for potentially simple tasks."""
    premium_models = {
        "gpt-4o", "gpt-4-turbo", "gpt-4.1", "o1", "o3",
        "claude-opus-4-5", "claude-opus-4", "claude-sonnet-4-5",
        "claude-sonnet-4", "claude-3.5-sonnet",
        "gemini-2.5-pro", "gemini-1.5-pro",
        "llama-3.1-405b",
    }

    total = sum(cost_by_model.values())
    if total <= 0:
        return 0

    premium_spend = sum(
        cost for model, cost in cost_by_model.items()
        if any(p in model.lower() for p in premium_models)
    )

    return (premium_spend / total) * 100


def generate_benchmark_section(data: Dict[str, Any], use_case: str = "both") -> str:
    """Generate the HOW YOU COMPARE section for insight output."""
    lines = ["📊 HOW YOU COMPARE", ""]
    total_cost = data.get("total_cost", 0)
    total_revenue = data.get("total_revenue", 0)
    cost_by_model = data.get("cost_by_model", {})
    annual_revenue = data.get("annual_revenue", 0)
    stage = data.get("stage") or detect_stage(total_cost)

    if use_case in ("revenue", "both") and total_revenue > 0:
        margin_pct = ((total_revenue - total_cost) / total_revenue * 100) if total_revenue > 0 else 0
        lines.append(f"Your gross margin ({margin_pct:.0f}%) vs benchmarks:")
        lines.append(get_bessemer_comparison(margin_pct))
        lines.append("")

    lines.append(f"Your AI spend (${total_cost:,.0f}/mo):")
    lines.append(f"  Avg organization: ${INDUSTRY_BENCHMARKS['avg_monthly_ai_spend']:,.0f}/mo")
    stage_line = get_stage_comparison(total_cost, stage)
    if stage_line:
        lines.append(stage_line)
    lines.append("")

    premium_pct = calculate_premium_overuse(cost_by_model)
    industry_avg = INDUSTRY_BENCHMARKS["premium_model_overuse_avg"]
    if premium_pct > 0:
        lines.append(f"Your cost efficiency:")
        comp = "above" if premium_pct > industry_avg else "below"
        lines.append(f"  {premium_pct:.0f}% of spend on premium models")
        lines.append(f"  Industry avg: {industry_avg}% — you're {comp} average")

    if use_case == "spend" and annual_revenue and annual_revenue > 0:
        ai_pct = (total_cost * 12 / annual_revenue) * 100
        avg_pct = INDUSTRY_BENCHMARKS["ai_spend_as_pct_of_revenue_avg"]
        lines.append(f"  AI spend as % of revenue: {ai_pct:.1f}% (industry avg: {avg_pct}%)")

    lines.append("")
    return "\n".join(lines)
