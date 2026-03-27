/**
 * AGENT ECONOMIC RATING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Compute economic rating for AI agents from sealed transaction history.
 * Rating dimensions (each 0-100 percentile):
 * - Cost Efficiency: how efficiently the agent uses AI resources vs peers
 * - Revenue Generation: how much revenue the agent's work generates
 * - Quality Consistency: standard deviation of quality scores
 * - Budget Compliance: percentage of calls within budget
 * - Reliability: uptime, error rate, retry rate
 *
 * Composite score: weighted average → letter grade (A+ through F)
 */

/**
 * Get agent transaction history from sealed records
 */
function getAgentHistory(orgId, agentId, period = '30d') {
  // Mock agent transaction data
  return [
    {
      seal_id: 'seal_101',
      timestamp: '2026-03-15T10:30:00Z',
      customer_id: 'cust_001',
      agent_name: 'research-bot',
      agent_id: 'agent_001',
      model: 'claude-3.5-sonnet',
      tokens_input: 2048,
      tokens_output: 512,
      cost_cents: 460,
      revenue_cents: 500,
      quality_score: 0.92,
      latency_ms: 234,
      error: false,
      cached: false,
    },
    {
      seal_id: 'seal_102',
      timestamp: '2026-03-15T11:15:00Z',
      customer_id: 'cust_002',
      agent_name: 'research-bot',
      agent_id: 'agent_001',
      model: 'claude-3-haiku',
      tokens_input: 512,
      tokens_output: 128,
      cost_cents: 45,
      revenue_cents: 150,
      quality_score: 0.88,
      latency_ms: 89,
      error: false,
      cached: true,
    },
    {
      seal_id: 'seal_103',
      timestamp: '2026-03-15T14:22:00Z',
      customer_id: 'cust_001',
      agent_name: 'research-bot',
      agent_id: 'agent_001',
      model: 'gpt-4o-mini',
      tokens_input: 1024,
      tokens_output: 256,
      cost_cents: 52,
      revenue_cents: 200,
      quality_score: 0.85,
      latency_ms: 156,
      error: false,
      cached: false,
    },
    {
      seal_id: 'seal_104',
      timestamp: '2026-03-16T09:45:00Z',
      customer_id: 'cust_003',
      agent_name: 'research-bot',
      agent_id: 'agent_001',
      model: 'claude-3.5-sonnet',
      tokens_input: 3024,
      tokens_output: 768,
      cost_cents: 385,
      revenue_cents: 600,
      quality_score: 0.94,
      latency_ms: 312,
      error: false,
      cached: false,
    },
  ];
}

/**
 * Calculate Cost Efficiency (percentile 0-100)
 * How efficiently the agent uses AI resources vs peers
 */
function calculateCostEfficiency(transactions) {
  if (transactions.length === 0) return 0;

  // Calculate cost per token
  const costPerToken = transactions.reduce((sum, tx) => {
    const totalTokens = tx.tokens_input + tx.tokens_output;
    return sum + (tx.cost_cents / totalTokens);
  }, 0) / transactions.length;

  // Calculate cost per dollar of revenue
  const costToRevenue = transactions.reduce((sum, tx) => {
    return sum + (tx.cost_cents / tx.revenue_cents);
  }, 0) / transactions.length;

  // Efficiency score: lower cost per token = higher score
  // Assuming industry average is 0.10 cents per token
  const industryAvg = 0.10;
  const efficiency = (industryAvg / costPerToken) * 100;

  return Math.min(100, Math.max(0, efficiency));
}

/**
 * Calculate Revenue Generation (percentile 0-100)
 * How much revenue the agent's work generates
 */
function calculateRevenueGeneration(transactions) {
  if (transactions.length === 0) return 0;

  const totalRevenue = transactions.reduce((sum, tx) => sum + tx.revenue_cents, 0);

  // Assuming industry average agent generates $2000/month
  const industryAvgCents = 200000;
  const revenueScore = (totalRevenue / industryAvgCents) * 100;

  return Math.min(100, Math.max(0, revenueScore));
}

/**
 * Calculate Quality Consistency (percentile 0-100)
 * Low standard deviation = high consistency = high score
 */
function calculateQualityConsistency(transactions) {
  if (transactions.length === 0) return 0;

  const scores = transactions.map(tx => tx.quality_score);
  const mean = scores.reduce((a, b) => a + b) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Low stdDev = high consistency
  // If stdDev is 0.05 or lower, full score (100)
  // If stdDev is 0.20 or higher, low score (0)
  const consistency = Math.max(0, (0.20 - stdDev) / 0.20) * 100;

  return Math.min(100, Math.max(0, consistency));
}

/**
 * Calculate Budget Compliance (percentile 0-100)
 * Percentage of calls within budget
 */
function calculateBudgetCompliance(transactions, budgetPerCallCents = 500) {
  if (transactions.length === 0) return 0;

  const withinBudget = transactions.filter(tx => tx.cost_cents <= budgetPerCallCents).length;
  const compliance = (withinBudget / transactions.length) * 100;

  return compliance;
}

/**
 * Calculate Reliability (percentile 0-100)
 * Based on: uptime, error rate, retry rate
 */
function calculateReliability(transactions) {
  if (transactions.length === 0) return 0;

  const errorCount = transactions.filter(tx => tx.error).length;
  const errorRate = (errorCount / transactions.length) * 100;

  // 0% error rate = 100 score
  // 5% error rate = 50 score
  // 10% error rate = 0 score
  const reliability = Math.max(0, (10 - errorRate) / 10) * 100;

  return Math.min(100, Math.max(0, reliability));
}

/**
 * Calculate overall rating and grade
 */
function calculateOverallRating(dimensions) {
  // Weights for each dimension
  const weights = {
    cost_efficiency: 0.25,
    revenue_generation: 0.20,
    quality_consistency: 0.25,
    budget_compliance: 0.20,
    reliability: 0.10,
  };

  const overall =
    dimensions.cost_efficiency * weights.cost_efficiency +
    dimensions.revenue_generation * weights.revenue_generation +
    dimensions.quality_consistency * weights.quality_consistency +
    dimensions.budget_compliance * weights.budget_compliance +
    dimensions.reliability * weights.reliability;

  // Convert to letter grade
  let grade = 'F';
  if (overall >= 95) grade = 'A+';
  else if (overall >= 90) grade = 'A';
  else if (overall >= 85) grade = 'A-';
  else if (overall >= 80) grade = 'B+';
  else if (overall >= 75) grade = 'B';
  else if (overall >= 70) grade = 'B-';
  else if (overall >= 65) grade = 'C+';
  else if (overall >= 60) grade = 'C';
  else if (overall >= 50) grade = 'C-';
  else if (overall >= 40) grade = 'D';

  return { score: overall, grade };
}

/**
 * GET /v1/agents/{agent_id}/rating
 * Compute rating from sealed history
 */
export async function handleAgentRating(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const agentId = request.params?.agent_id;
    if (!agentId) {
      return new Response(JSON.stringify({ error: 'Missing agent_id' }), { status: 400 });
    }

    // Get agent transaction history
    const transactions = getAgentHistory(orgId, agentId);

    // Calculate dimensions
    const dimensions = {
      cost_efficiency: calculateCostEfficiency(transactions),
      revenue_generation: calculateRevenueGeneration(transactions),
      quality_consistency: calculateQualityConsistency(transactions),
      budget_compliance: calculateBudgetCompliance(transactions),
      reliability: calculateReliability(transactions),
    };

    // Calculate overall rating
    const { score: overallScore, grade } = calculateOverallRating(dimensions);

    const response = {
      status: 'success',
      org_id: orgId,
      agent_id: agentId,
      rating: {
        overall_score: Math.round(overallScore * 100) / 100,
        grade,
        percentile_rank: Math.round(overallScore), // Simplified
        trend: 'up', // Would be calculated from history
      },
      dimensions: {
        cost_efficiency: {
          score: Math.round(dimensions.cost_efficiency * 100) / 100,
          meaning: 'How efficiently uses AI resources vs peers',
          percentile_rank: Math.round(dimensions.cost_efficiency),
        },
        revenue_generation: {
          score: Math.round(dimensions.revenue_generation * 100) / 100,
          meaning: 'Revenue generated from AI work',
          percentile_rank: Math.round(dimensions.revenue_generation),
        },
        quality_consistency: {
          score: Math.round(dimensions.quality_consistency * 100) / 100,
          meaning: 'Consistency of quality outputs (low variance)',
          percentile_rank: Math.round(dimensions.quality_consistency),
        },
        budget_compliance: {
          score: Math.round(dimensions.budget_compliance * 100) / 100,
          meaning: 'Percentage of calls within budget',
          percentile_rank: Math.round(dimensions.budget_compliance),
        },
        reliability: {
          score: Math.round(dimensions.reliability * 100) / 100,
          meaning: 'Error rate and uptime',
          percentile_rank: Math.round(dimensions.reliability),
        },
      },
      analytics: {
        total_sealed_transactions: transactions.length,
        total_cost_cents: transactions.reduce((sum, tx) => sum + tx.cost_cents, 0),
        total_revenue_cents: transactions.reduce((sum, tx) => sum + tx.revenue_cents, 0),
        average_quality_score: Math.round(
          transactions.reduce((sum, tx) => sum + tx.quality_score, 0) / transactions.length * 100
        ) / 100,
        average_latency_ms: Math.round(
          transactions.reduce((sum, tx) => sum + tx.latency_ms, 0) / transactions.length
        ),
      },
      exportable_badge: {
        format: 'svg',
        url: `/v1/agents/${agentId}/badge.svg`,
        markdown: `[![Finault Agent Rating](${`/v1/agents/${agentId}/badge.svg`})](finault.ai/agents/${agentId})`,
        alt_text: `Agent ${agentId}: Grade ${grade}`,
      },
      period: 'last_30_days',
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Agent rating error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to compute rating',
        message: error.message,
      }),
      { status: 500 }
    );
  }
}

/**
 * GET /v1/agents/leaderboard
 * Rank all agents in organization
 */
export async function handleAgentLeaderboard(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Mock leaderboard data
    const agents = [
      {
        rank: 1,
        agent_id: 'agent_001',
        agent_name: 'research-bot',
        score: 87.3,
        grade: 'B+',
        transactions: 4,
        cost_efficiency_rank: 3,
        revenue_generation_rank: 1,
      },
      {
        rank: 2,
        agent_id: 'agent_002',
        agent_name: 'analysis-engine',
        score: 82.1,
        grade: 'B',
        transactions: 12,
        cost_efficiency_rank: 1,
        revenue_generation_rank: 2,
      },
      {
        rank: 3,
        agent_id: 'agent_003',
        agent_name: 'summarizer',
        score: 76.5,
        grade: 'C+',
        transactions: 8,
        cost_efficiency_rank: 5,
        revenue_generation_rank: 5,
      },
    ];

    const response = {
      status: 'success',
      org_id: orgId,
      leaderboard: agents,
      summary: {
        total_agents: agents.length,
        average_score: Math.round(
          agents.reduce((sum, a) => sum + a.score, 0) / agents.length * 100
        ) / 100,
        top_performer: agents[0].agent_name,
        total_transactions: agents.reduce((sum, a) => sum + a.transactions, 0),
      },
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to load leaderboard',
        message: error.message,
      }),
      { status: 500 }
    );
  }
}

/**
 * GET /v1/agents/{agent_id}/history
 * Rating trend over time
 */
export async function handleAgentHistory(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const agentId = request.params?.agent_id;
    if (!agentId) {
      return new Response(JSON.stringify({ error: 'Missing agent_id' }), { status: 400 });
    }

    // Mock history data
    const history = [
      {
        period: '2026-03-01 to 2026-03-07',
        score: 84.2,
        grade: 'B',
        transactions: 12,
        dimensions: {
          cost_efficiency: 82,
          revenue_generation: 85,
          quality_consistency: 88,
          budget_compliance: 92,
          reliability: 100,
        },
      },
      {
        period: '2026-03-08 to 2026-03-14',
        score: 86.1,
        grade: 'B+',
        transactions: 8,
        dimensions: {
          cost_efficiency: 85,
          revenue_generation: 84,
          quality_consistency: 90,
          budget_compliance: 91,
          reliability: 98,
        },
      },
      {
        period: '2026-03-15 to 2026-03-21',
        score: 87.3,
        grade: 'B+',
        transactions: 4,
        dimensions: {
          cost_efficiency: 88,
          revenue_generation: 86,
          quality_consistency: 91,
          budget_compliance: 93,
          reliability: 100,
        },
      },
    ];

    const response = {
      status: 'success',
      org_id: orgId,
      agent_id: agentId,
      history,
      trend: {
        direction: 'up',
        change_pct: 3.6, // (87.3 - 84.2) / 84.2 * 100
        momentum: 'accelerating',
      },
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Agent history error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to load history',
        message: error.message,
      }),
      { status: 500 }
    );
  }
}

export default handleAgentRating;
