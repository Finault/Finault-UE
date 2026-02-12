# Finault Agent Learnings

This file is automatically updated by the Compound Learning Agent.
It contains learnings extracted from agent sessions to improve future performance.

**Last Updated:** 2026-01-30T19:30:00Z (Initial)
**Sessions Reviewed:** 0
**Total Learnings:** 0

---

## cost_patterns
*Patterns in AI cost data (spikes, trends, correlations)*

- [INITIAL] Monitor for Monday morning spikes - many teams have batch jobs that kick off at start of week
- [INITIAL] End-of-month spending often increases due to reporting and analytics workloads
- [INITIAL] Watch for cost correlation between model upgrades (e.g., GPT-4 → GPT-4-Turbo transitions)

---

## optimization_strategies
*What optimization strategies work best*

- [INITIAL] Model switching (GPT-4 → Haiku for simple tasks) typically yields 50-80% savings with minimal quality impact
- [INITIAL] Response caching is highly effective for customer service and FAQ workloads (30-50% savings)
- [INITIAL] Rate limiting prevents runaway costs but needs careful threshold tuning to avoid blocking legitimate traffic
- [INITIAL] Reserved capacity works best for predictable, high-volume workloads with >70% utilization

---

## user_preferences
*How users like to interact, their priorities*

- [INITIAL] Executives prefer dollar amounts over percentages for impact
- [INITIAL] Technical users appreciate detailed breakdowns; executives want summaries first
- [INITIAL] Always offer actionable next steps, not just data
- [INITIAL] When presenting optimizations, lead with confidence level and risk assessment

---

## integration_gotchas
*Issues with specific providers, ERPs, or data formats*

- [INITIAL] OpenAI invoice format changes periodically - parser must be flexible
- [INITIAL] Anthropic billing is per-workspace, may need consolidation across workspaces
- [INITIAL] AWS Bedrock bills separately from direct Claude API usage
- [INITIAL] SAP integration requires specific date formats (YYYYMMDD)
- [INITIAL] NetSuite has rate limits on API calls - batch operations when possible

---

## forecasting_accuracy
*How accurate were predictions vs actuals*

- [INITIAL] Linear regression alone underestimates growth in rapidly scaling orgs
- [INITIAL] Include seasonality adjustment for more accurate weekly/monthly forecasts
- [INITIAL] 15% error margin is acceptable for most planning purposes
- [INITIAL] Forecasts beyond 3 months have significantly higher uncertainty

---

## anomaly_signatures
*Signatures of real anomalies vs false positives*

- [INITIAL] Single-day spikes followed by immediate return to baseline = likely batch job or one-time event
- [INITIAL] Gradual increase over 3+ days = trend shift, not anomaly
- [INITIAL] Provider-specific spike when others normal = likely that provider's issue (outage retry, etc.)
- [INITIAL] All providers spike simultaneously = likely legitimate usage increase or new feature launch

---

## report_preferences
*What executives actually want to see in reports*

- [INITIAL] Lead with: Total spend, vs budget, vs last period
- [INITIAL] Top 3 cost drivers (not exhaustive lists)
- [INITIAL] Anomalies that matter (> $1000 impact)
- [INITIAL] Actionable recommendations with ROI estimates
- [INITIAL] Keep Close Pack reports to 2-3 pages max

---

## agent_behavior
*How agents should behave in specific situations*

- [INITIAL] When user says "optimize", always ask what constraints (budget, quality requirements)
- [INITIAL] Never apply optimizations without explicit confirmation
- [INITIAL] If forecast shows budget breach, proactively alert even if not asked
- [INITIAL] For compliance questions, err on the side of caution in recommendations

---

## Known Issues & Workarounds

### Data Quality
- [ ] Some providers don't include model breakdown in invoices - need to infer from API logs
- [ ] Token counts may be estimates for older invoice formats

### Performance
- [ ] Large organizations (>1M records) need pagination in cost analysis
- [ ] Anomaly detection on >90 days of data should use sampling

### UX
- [ ] Users often confuse "allocation" with "attribution" - clarify in responses
- [ ] Technical jargon (EWMA, CUSUM) should be explained or avoided with non-technical users

---

## Changelog

### 2026-01-30 (Initial)
- Created initial AGENTS.md with baseline learnings
- Categories established based on Finault's core use cases
- Seeded with best practices from AI cost management domain
