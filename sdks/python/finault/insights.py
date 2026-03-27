"""
Finault Insight Engine — Narrative output that replaces data dumps with financial intelligence.

Takes raw sync data and generates use-case-aware terminal output that reads like
a financial advisor, not a CSV parser.

The insight engine adapts based on the org's use_case setting:
  - "revenue": Margin-first framing (customers, features, Bessemer tiers)
  - "spend": Cost governance framing (teams, trends, waste, budgets)
  - "both": Combined view with tab-style sections
"""

from typing import Dict, List, Optional, Any


# ─── Score Dimension Narratives ──────────────────────────────────────────────

def _score_narrative(dimension: str, score: int) -> str:
    """Generate a one-line narrative for a Finault Score dimension."""
    narratives = {
        "margin_health": {
            80: "strong margins — investor-ready",
            60: "healthy but watch for compression",
            40: "below Shooting Star threshold — action needed",
            0: "critical — margin erosion threatens viability",
        },
        "unit_economics": {
            80: "excellent cost-per-customer efficiency",
            60: "healthy but room for per-customer optimization",
            40: "some customers cost more than they pay",
            0: "unit economics unsustainable at scale",
        },
        "cost_efficiency": {
            80: "excellent model selection and routing",
            60: "good but optimization opportunities remain",
            40: "significant spend on premium models for simple tasks",
            0: "major waste — premium models used where cheaper ones suffice",
        },
        "trend_trajectory": {
            80: "costs stable or declining relative to output",
            60: "manageable growth rate",
            40: "spend growing faster than value — watch closely",
            0: "unsustainable cost trajectory",
        },
        "governance_maturity": {
            80: "sealed chain, complete attribution, full visibility",
            60: "good governance with minor gaps",
            40: "incomplete attribution or chain gaps",
            0: "minimal governance — audit risk",
        },
        "diversification": {
            80: "well-diversified across providers and models",
            60: "moderate concentration — manageable risk",
            40: "high provider concentration",
            0: "single-vendor dependency — critical risk",
        },
    }

    dim_narratives = narratives.get(dimension, {})
    for threshold in sorted(dim_narratives.keys(), reverse=True):
        if score >= threshold:
            return dim_narratives[threshold]
    return ""


def _bessemer_context(margin_pct: float) -> str:
    """Generate Bessemer tier context for a given margin percentage."""
    if margin_pct >= 60:
        return (
            f"That puts you in Bessemer's 'Shooting Star' territory — "
            f"strong unit economics that investors want to see."
        )
    elif margin_pct >= 40:
        return (
            f"That's above the AI Supernova average (25%) but below the Shooting Star "
            f"threshold (60%) that investors target at Series B+."
        )
    elif margin_pct >= 25:
        return (
            f"That's in line with Bessemer's AI Supernova average — fast growth "
            f"but margins that need improvement before your next raise."
        )
    else:
        return (
            f"That's below Bessemer's Supernova average (25%). Margin improvement "
            f"should be a top priority before your next board meeting."
        )


def _mom_comparison(current: float, previous: float) -> str:
    """Month-over-month comparison string."""
    if previous and previous > 0:
        pct = ((current - previous) / previous) * 100
        direction = "up" if pct > 0 else "down"
        return f", {direction} {abs(pct):.0f}% from last month"
    return ""


def _bar_chart(items: List[tuple], max_width: int = 30) -> str:
    """Generate a simple terminal bar chart from (label, value) tuples."""
    if not items:
        return ""
    max_val = max(v for _, v in items) if items else 1
    lines = []
    for label, value in items:
        bar_len = int((value / max_val) * max_width) if max_val > 0 else 0
        bar = "█" * bar_len
        lines.append(f"   {label:<20} {bar} ${value:,.0f}")
    return "\n".join(lines)


# ─── Revenue Use Case Output ────────────────────────────────────────────────

def generate_revenue_insights(data: Dict[str, Any]) -> str:
    """Generate narrative output for revenue use case (margin-first framing)."""
    lines = []
    period = data.get("period", "Unknown Period")
    total_cost = data.get("total_cost", 0)
    total_revenue = data.get("total_revenue", 0)
    margin_pct = ((total_revenue - total_cost) / total_revenue * 100) if total_revenue > 0 else 0
    prior = data.get("prior_period", {})
    prior_cost = prior.get("total_cost", 0)
    chain_depth = data.get("chain_depth", 1)
    chain_hash = data.get("chain_hash", "")
    score_data = data.get("finault_score", {})
    savings_list = data.get("savings", [])
    margin_by_customer = data.get("margin_by_customer", {})

    # Header
    lines.append(f"⚡ FINAULT SYNC COMPLETE — {period}")
    lines.append("")

    # Margin summary
    if total_revenue > 0:
        mom = _mom_comparison(total_cost, prior_cost)
        lines.append(
            f"Your AI features generated ${total_revenue:,.0f} in revenue against "
            f"${total_cost:,.0f} in AI costs{mom} — a {margin_pct:.0f}% gross margin."
        )
        lines.append(_bessemer_context(margin_pct))
    else:
        lines.append(f"Total AI cost: ${total_cost:,.0f}{_mom_comparison(total_cost, prior_cost)}.")
        lines.append("Connect Stripe or enter revenue data to see margin analysis.")

    lines.append("")

    # Unprofitable customers
    if margin_by_customer:
        unprofitable = [
            (name, d) for name, d in margin_by_customer.items()
            if d.get("margin_pct", 100) < 0
        ]
        total_customers = len(margin_by_customer)

        if unprofitable:
            lines.append(f"🔴 {len(unprofitable)} of your {total_customers} customers are unprofitable:")
            for name, d in sorted(unprofitable, key=lambda x: x[1].get("margin_pct", 0)):
                cost = d.get("cost", 0)
                rev = d.get("revenue", 0)
                mpct = d.get("margin_pct", 0)
                lines.append(f"   • {name}:  costs ${cost:,.0f}/mo, pays ${rev:,.0f}/mo  ({mpct:+.0f}%)")
        else:
            lowest = min(margin_by_customer.items(), key=lambda x: x[1].get("margin_pct", 100))
            lines.append(
                f"✅ All {total_customers} customers are profitable. "
                f"Lowest margin: {lowest[0]} at {lowest[1].get('margin_pct', 0):.0f}%."
            )
        lines.append("")

    # MoM trend warning
    if prior and total_revenue > 0:
        prior_revenue = prior.get("total_revenue", 0)
        if prior_cost > 0 and prior_revenue > 0:
            cost_growth = ((total_cost - prior_cost) / prior_cost) * 100
            rev_growth = ((total_revenue - prior_revenue) / prior_revenue) * 100
            if cost_growth > rev_growth + 5:
                lines.append(
                    f"⚠️  AI costs grew {cost_growth:.0f}% while revenue grew "
                    f"{rev_growth:.0f}% — margin compression in progress."
                )
                lines.append("")

    # Savings
    if savings_list:
        lines.append("💡 FASTEST PATH TO BETTER MARGINS:")
        top = savings_list[0] if isinstance(savings_list, list) else savings_list
        if isinstance(top, dict):
            from_model = top.get("from", top.get("model", "?"))
            to_model = top.get("to", top.get("downgrade_to", "?"))
            monthly = top.get("monthly_savings", top.get("savings_amt", 0))
            projected_margin = margin_pct + (monthly / total_revenue * 100) if total_revenue > 0 else 0
            lines.append(
                f"   Switch from {from_model} → {to_model}"
            )
            lines.append(f"   Savings: ${monthly:,.0f}/mo | Margin: {margin_pct:.0f}% → {projected_margin:.0f}%")
            # How many unprofitable flip
            if margin_by_customer:
                unprofitable_count = sum(
                    1 for d in margin_by_customer.values() if d.get("margin_pct", 100) < 0
                )
                if unprofitable_count > 0:
                    lines.append(f"   {unprofitable_count} unprofitable customers could become profitable.")
            lines.append("")
            lines.append(f"   Run `finault simulate --switch {from_model}:{to_model}` for details.")
        lines.append("")

    # Finault Score
    overall = score_data.get("overall", score_data.get("score", 0))
    grade = score_data.get("grade", "?")
    dims = score_data.get("dimensions", {})
    lines.append(f"📊 FINAULT SCORE: {overall} ({grade})")

    # Revenue use case orders dimensions by margin relevance
    dim_order = ["margin_health", "unit_economics", "cost_efficiency",
                 "trend_trajectory", "governance_maturity", "diversification"]
    dim_labels = {
        "margin_health": "Margin Health",
        "unit_economics": "Unit Economics",
        "cost_efficiency": "Cost Efficiency",
        "trend_trajectory": "Trend",
        "governance_maturity": "Governance",
        "diversification": "Diversification",
    }

    for dim in dim_order:
        dim_val = dims.get(dim, {})
        dim_score = dim_val.get("score", dim_val) if isinstance(dim_val, dict) else dim_val
        if isinstance(dim_score, (int, float)):
            narrative = _score_narrative(dim, int(dim_score))
            label = dim_labels.get(dim, dim)
            lines.append(f"   {label:<18} {int(dim_score):>3}/100 — {narrative}")
    lines.append("")

    # Close Pack
    hash_short = chain_hash[:12] + "..." if chain_hash else "pending"
    lines.append(f"📦 Close Pack #{chain_depth} sealed.")
    lines.append(f"   SHA-256: {hash_short}")
    lines.append(f"   View: {_dashboard_url()}")
    lines.append("")

    return "\n".join(lines)


# ─── Spend Use Case Output ──────────────────────────────────────────────────

def generate_spend_insights(data: Dict[str, Any]) -> str:
    """Generate narrative output for spend use case (cost governance framing)."""
    lines = []
    period = data.get("period", "Unknown Period")
    total_cost = data.get("total_cost", 0)
    annual_revenue = data.get("annual_revenue", 0)
    prior = data.get("prior_period", {})
    prior_cost = prior.get("total_cost", 0)
    chain_depth = data.get("chain_depth", 1)
    chain_hash = data.get("chain_hash", "")
    score_data = data.get("finault_score", {})
    savings_list = data.get("savings", [])
    cost_by_team = data.get("cost_by_cost_center", data.get("cost_by_team", {}))
    cost_by_model = data.get("cost_by_model", {})

    # Header
    lines.append(f"⚡ FINAULT SYNC COMPLETE — {period}")
    lines.append("")

    # Spend summary
    mom = _mom_comparison(total_cost, prior_cost)
    lines.append(f"Your organization spent ${total_cost:,.0f} on AI this month{mom}.")
    if annual_revenue and annual_revenue > 0:
        ai_pct = (total_cost * 12 / annual_revenue) * 100
        lines.append(f"AI spend represents {ai_pct:.1f}% of annual revenue.")
    lines.append("")

    # Spend by team
    if cost_by_team:
        lines.append("📊 SPEND BY TEAM:")
        team_items = sorted(cost_by_team.items(), key=lambda x: x[1], reverse=True)
        lines.append(_bar_chart(team_items))

        # MoM comparison per team if we have prior data
        prior_by_team = prior.get("cost_by_cost_center", prior.get("cost_by_team", {}))
        if prior_by_team:
            fast_growers = []
            for team, cost in team_items:
                prev_team_cost = prior_by_team.get(team, 0)
                if prev_team_cost > 0:
                    growth = ((cost - prev_team_cost) / prev_team_cost) * 100
                    if growth > 15:
                        fast_growers.append((team, growth))
            if fast_growers:
                lines.append("")
                for team, growth in sorted(fast_growers, key=lambda x: x[1], reverse=True):
                    lines.append(f"   ⚠️  {team}: ↑{growth:.0f}% MoM")
        lines.append("")

    # MoM trend warning
    if prior_cost > 0 and annual_revenue > 0:
        cost_growth = ((total_cost - prior_cost) / prior_cost) * 100
        if cost_growth > 10:
            ai_pct = (total_cost * 12 / annual_revenue) * 100
            lines.append(
                f"⚠️  AI spend grew {cost_growth:.0f}% MoM. "
                f"{ai_pct:.1f}% of company revenue now goes to AI."
            )
            lines.append("")

    # Trend section
    if chain_depth >= 2 and prior_cost > 0:
        mom_pct = ((total_cost - prior_cost) / prior_cost) * 100 if prior_cost > 0 else 0
        projected_annual = total_cost * 12
        lines.append(f"📈 TREND (last {chain_depth} months):")
        lines.append(f"   Growth rate: {mom_pct:+.0f}% MoM")
        lines.append(f"   At this rate, annual AI spend: ${projected_annual:,.0f}")
        lines.append("")

    # Savings (spend-framed)
    if savings_list:
        lines.append("💡 OPTIMIZATION OPPORTUNITIES:")
        top = savings_list[0] if isinstance(savings_list, list) else savings_list
        if isinstance(top, dict):
            from_model = top.get("from", top.get("model", "?"))
            to_model = top.get("to", top.get("downgrade_to", "?"))
            monthly = top.get("monthly_savings", top.get("savings_amt", 0))
            annual = monthly * 12
            budget_pct = (monthly / total_cost * 100) if total_cost > 0 else 0
            lines.append(
                f"   Switch from {from_model} → {to_model}"
            )
            lines.append(f"   Saves ${monthly:,.0f}/mo — {budget_pct:.0f}% of monthly AI budget")
            lines.append(f"   Annual impact: ${annual:,.0f}")
            lines.append("")
            lines.append(f"   Run `finault simulate --switch {from_model}:{to_model}` for details.")
        lines.append("")

    # Finault Score (spend use case orders dimensions by cost relevance)
    overall = score_data.get("overall", score_data.get("score", 0))
    grade = score_data.get("grade", "?")
    dims = score_data.get("dimensions", {})
    lines.append(f"📊 FINAULT SCORE: {overall} ({grade})")

    dim_order = ["cost_efficiency", "trend_trajectory", "governance_maturity",
                 "unit_economics", "margin_health", "diversification"]
    dim_labels = {
        "margin_health": "Margin Health",
        "unit_economics": "Unit Economics",
        "cost_efficiency": "Cost Efficiency",
        "trend_trajectory": "Trend Trajectory",
        "governance_maturity": "Governance",
        "diversification": "Diversification",
    }

    for dim in dim_order:
        dim_val = dims.get(dim, {})
        dim_score = dim_val.get("score", dim_val) if isinstance(dim_val, dict) else dim_val
        if isinstance(dim_score, (int, float)):
            narrative = _score_narrative(dim, int(dim_score))
            label = dim_labels.get(dim, dim)
            lines.append(f"   {label:<18} {int(dim_score):>3}/100 — {narrative}")
    lines.append("")

    # Close Pack
    hash_short = chain_hash[:12] + "..." if chain_hash else "pending"
    lines.append(f"📦 Close Pack #{chain_depth} sealed.")
    lines.append(f"   SHA-256: {hash_short}")
    lines.append(f"   View: {_dashboard_url()}")
    lines.append("")

    return "\n".join(lines)


# ─── Historical Reconstruction Summary ──────────────────────────────────────

def generate_historical_summary(periods: List[Dict[str, Any]], use_case: str = "both") -> str:
    """Generate summary for 90-day historical reconstruction."""
    lines = []
    lines.append("📊 HISTORICAL RECONSTRUCTION")
    lines.append("")
    lines.append("Before Finault, here's what you couldn't see:")
    lines.append("")

    prev_cost = None
    for p in periods:
        raw_label = p.get("period", "?")
        # Convert YYYY-MM to friendly name
        try:
            from calendar import month_name
            parts = raw_label.split("-")
            label = f"{month_name[int(parts[1])]} {parts[0]}"
        except Exception:
            label = raw_label
        cost = p.get("total_cost", 0)
        trend = ""
        if prev_cost is not None and prev_cost > 0:
            pct = ((cost - prev_cost) / prev_cost) * 100
            trend = f"↑{pct:.0f}%" if pct > 0 else f"↓{abs(pct):.0f}%"

        if use_case in ("revenue", "both") and p.get("total_revenue"):
            margin = ((p["total_revenue"] - cost) / p["total_revenue"] * 100) if p["total_revenue"] > 0 else 0
            lines.append(f"   {label}: ${cost:,.0f} AI cost | {margin:.0f}% margin {trend}")
        else:
            lines.append(f"   {label}: ${cost:,.0f} AI cost {trend}")
        prev_cost = cost

    lines.append("")

    # Trend narrative
    if len(periods) >= 2:
        first_cost = periods[0].get("total_cost", 0)
        last_cost = periods[-1].get("total_cost", 0)
        if first_cost > 0:
            overall_growth = ((last_cost - first_cost) / first_cost) * 100
            if overall_growth > 20:
                lines.append(f"   ⚠️  AI spend grew {overall_growth:.0f}% over this period.")
            elif overall_growth > 0:
                lines.append(f"   AI spend grew {overall_growth:.0f}% — moderate increase.")
            else:
                lines.append(f"   ✓ AI spend decreased {abs(overall_growth):.0f}% — trending well.")

    lines.append("")
    lines.append(f"Close Packs sealed for all {len(periods)} months. Chain depth: {len(periods)}.")
    lines.append("")
    lines.append("─" * 50)
    lines.append("")
    lines.append("Now, your current month:")
    lines.append("")

    return "\n".join(lines)


# ─── Main Entry Point ───────────────────────────────────────────────────────

def generate_insights(data: Dict[str, Any], use_case: str = "both") -> str:
    """
    Main entry point. Routes to the right insight generator based on use_case.

    Args:
        data: The sync result data dict with costs, revenue, scores, savings, etc.
        use_case: "revenue", "spend", or "both"

    Returns:
        Formatted terminal output string with consistent 2-space indentation.
    """
    if use_case == "revenue":
        raw = generate_revenue_insights(data)
    elif use_case == "spend":
        raw = generate_spend_insights(data)
    else:
        # "both" — generate revenue insights (which is the superset)
        raw = generate_revenue_insights(data)

    # Add consistent 2-space indent to all non-empty lines for terminal polish
    lines = []
    for line in raw.split("\n"):
        if line.strip():
            lines.append(f"  {line}")
        else:
            lines.append("")
    return "\n".join(lines)


def _dashboard_url() -> str:
    """Get the dashboard URL."""
    return "https://app.finault.ai/dashboard"
