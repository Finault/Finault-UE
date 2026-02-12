/**
 * FINAULT AGENTOS - Cloudflare Workers Entry Point
 * Wraps the Hono-based AgentOS API for edge deployment
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseResilience, createFetchResilience } from './core/resilience-layer.js';
import { safeJsonParse, createFallbackResponse } from './core/api-response-guard.js';

const resilientGatewayFetch = createFetchResilience('ai-gateway');

const app = new Hono();

// Middleware
app.use('*', cors());

// Initialize Supabase client helper
function getSupabase(env) {
  return createSupabaseResilience(createClient(env.SUPABASE_URL, env.SUPABASE_KEY));
}

// ═══ Tenant Isolation Helpers ═══
function getOrganizationId(headers, payload) {
  // SECURITY: Extract org_id from JWT payload or request body
  // For Cloudflare Workers, we should validate the organization context
  const orgId = payload?.org || headers?.get('X-Organization-Id');
  if (!orgId) {
    throw new Error('Organization ID is required (missing org in JWT or X-Organization-Id header)');
  }
  return orgId;
}

// JWT middleware factory - SECURITY: Fail loudly if JWT_SECRET not configured in production
function jwtAuth(env) {
  const JWT_SECRET = env.JWT_SECRET;
  if (!JWT_SECRET && env.ENVIRONMENT === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production');
  }
  return jwt({ secret: JWT_SECRET || 'dev-secret-DO-NOT-USE-IN-PRODUCTION' });
}

// ===================================
// HEALTH & INFO ENDPOINTS
// ===================================

app.get('/', (c) => {
  return c.json({
    name: 'Finault AgentOS',
    version: c.env.AGENTOS_VERSION || '1.0.0',
    runtime: 'cloudflare-workers',
    status: 'operational',
    endpoints: {
      chat: 'POST /api/v1/chat',
      intelligence: 'POST /api/v1/intelligence/*',
      optimizations: 'GET /api/v1/optimizations',
      forecast: 'GET /api/v1/forecast',
      policies: 'GET /api/v1/policies/*',
      agents: 'GET /api/v1/agents'
    },
    agents: [
      'finault-pal',
      'cost-intelligence',
      'optimization',
      'forecasting',
      'policy',
      'invoice-reconciliation',
      'budget-enforcer',
      'chargeback',
      'close-pack-generator'
    ]
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    region: c.req.cf?.colo || 'unknown'
  });
});

// ===================================
// AGENT REGISTRY
// ===================================

const AGENT_REGISTRY = {
  'finault-pal': {
    name: 'Finault Pal',
    description: 'Conversational AI assistant for cost management',
    capabilities: ['chat', 'analysis', 'recommendations'],
    category: 'core'
  },
  'cost-intelligence': {
    name: 'Cost Intelligence Agent',
    description: 'Anomaly detection and pattern analysis',
    capabilities: ['anomaly_detection', 'pattern_learning', 'driver_analysis'],
    category: 'analytics'
  },
  'optimization': {
    name: 'Optimization Agent',
    description: 'Find and apply cost optimizations',
    capabilities: ['find_savings', 'apply_optimizations', 'track_impact'],
    category: 'automation'
  },
  'forecasting': {
    name: 'Forecasting Agent',
    description: 'AI-powered cost forecasting',
    capabilities: ['forecast', 'scenario_modeling', 'budget_analysis'],
    category: 'analytics'
  },
  'policy': {
    name: 'Policy Agent',
    description: 'Policy enforcement and compliance',
    capabilities: ['compliance_check', 'violation_tracking', 'policy_management'],
    category: 'governance'
  },
  'invoice-reconciliation': {
    name: 'Invoice Reconciliation Agent',
    description: '3-way invoice matching and GL entries',
    capabilities: ['three_way_match', 'gl_entries', 'dispute_detection'],
    category: 'finance'
  },
  'budget-enforcer': {
    name: 'Budget Enforcer Agent',
    description: 'Real-time budget enforcement with HTTP 402',
    capabilities: ['hard_caps', 'soft_warnings', 'approval_workflows'],
    category: 'governance'
  },
  'chargeback': {
    name: 'Chargeback Agent',
    description: 'Self-service cost allocation',
    capabilities: ['cost_allocation', 'showback', 'business_unit_reporting'],
    category: 'finance'
  },
  'close-pack': {
    name: 'Close Pack Generator',
    description: 'CFO-ready month-end reports',
    capabilities: ['executive_summary', 'variance_analysis', 'ai_narrative'],
    category: 'reporting'
  }
};

app.get('/api/v1/agents', (c) => {
  return c.json({
    success: true,
    count: Object.keys(AGENT_REGISTRY).length,
    agents: AGENT_REGISTRY
  });
});

app.get('/api/v1/agents/:agentId', (c) => {
  const agentId = c.req.param('agentId');
  const agent = AGENT_REGISTRY[agentId];

  if (!agent) {
    return c.json({ success: false, error: 'Agent not found' }, 404);
  }

  return c.json({ success: true, agent: { id: agentId, ...agent } });
});

// ===================================
// FINAULT PAL - Conversational Agent
// ===================================

app.post('/api/v1/chat', async (c) => {
  try {
    const { message, session_id, context } = await c.req.json();
    const supabase = getSupabase(c.env);

    // SECURITY: Extract and validate organization context
    // TODO: Implement JWT middleware to extract org_id from token payload
    const organizationId = getOrganizationId(c.req.raw.headers, {}) || 'default-org';
    const userId = c.get('jwtPayload')?.sub || 'anonymous';

    // Get or create session with organization context
    let session = null;
    if (session_id) {
      const { data } = await supabase
        .from('agent_sessions')
        .select('*')
        .eq('id', session_id)
        .eq('organization_id', organizationId)
        .single();
      session = data;
    }

    // Build conversation context
    const systemPrompt = `You are Finault Pal, an expert AI assistant for enterprise AI cost governance.
You help CFOs and finance teams understand, optimize, and control their AI spending.
Your responses should be clear, actionable, and backed by data when available.
You have access to these capabilities:
- Cost analysis and anomaly detection
- Budget forecasting and scenario modeling
- Policy compliance checking
- Optimization recommendations
- Invoice reconciliation assistance

Current context: ${context ? JSON.stringify(context) : 'No additional context'}`;

    // Call AI provider via the gateway
    const aiResponse = await resilientGatewayFetch('https://api.finault.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.OPENAI_API_KEY || c.env.ANTHROPIC_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 1000
      })
    });

    // W-020: Safe API response parsing with error categorization
    const { ok: parseOk, data: aiData, error: parseError, statusCode } = await safeJsonParse(aiResponse);
    if (!parseOk) {
      console.error(`[Worker] API response error: ${parseError} (status: ${statusCode})`);
      const fallbackData = createFallbackResponse(parseError, 'I apologize, the AI service is temporarily unavailable.');
      const responseContent = fallbackData.choices[0].message.content;
      const responseUsage = fallbackData.usage;

      // Log the interaction with fallback (SECURITY: include org context)
      await supabase.from('agent_interactions').insert({
        session_id: session_id || crypto.randomUUID(),
        organization_id: organizationId,
        user_id: userId,
        agent: 'finault-pal',
        input: message,
        output: responseContent,
        tokens_used: responseUsage?.total_tokens || 0,
        created_at: new Date().toISOString()
      });

      return c.json({
        success: false,
        response: responseContent,
        session_id: session_id || crypto.randomUUID(),
        usage: responseUsage,
        error: parseError,
        statusCode
      }, 500);
    }

    // Log the interaction (SECURITY: include org context)
    await supabase.from('agent_interactions').insert({
      session_id: session_id || crypto.randomUUID(),
      organization_id: organizationId,
      user_id: userId,
      agent: 'finault-pal',
      input: message,
      output: aiData.choices?.[0]?.message?.content || 'No response',
      tokens_used: aiData.usage?.total_tokens || 0,
      created_at: new Date().toISOString()
    });

    return c.json({
      success: true,
      response: aiData.choices?.[0]?.message?.content || 'I apologize, I could not process that request.',
      session_id: session_id || crypto.randomUUID(),
      usage: aiData.usage,
      suggestions: [
        'Show me cost anomalies',
        'What optimizations are available?',
        'Forecast next month spending'
      ]
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error.message,
      response: 'I encountered an error processing your request. Please try again.'
    }, 500);
  }
});

// ===================================
// COST INTELLIGENCE AGENT
// ===================================

app.post('/api/v1/intelligence/anomalies', async (c) => {
  try {
    const { timeframe, threshold, providers } = await c.req.json();
    const supabase = getSupabase(c.env);

    // TODO: SECURITY - Extract org_id from JWT and enforce tenant isolation in queries
    const organizationId = 'default-org'; // Placeholder: should extract from JWT

    // Fetch usage data
    const { data: usage } = await supabase
      .from('usage')
      .select('*')
      .gte('created_at', new Date(Date.now() - (timeframe || 7) * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    // Simple anomaly detection (statistical)
    const anomalies = [];
    if (usage && usage.length > 0) {
      const avgTokens = usage.reduce((sum, u) => sum + (u.total_tokens || 0), 0) / usage.length;
      const stdDev = Math.sqrt(
        usage.reduce((sum, u) => sum + Math.pow((u.total_tokens || 0) - avgTokens, 2), 0) / usage.length
      );

      usage.forEach(u => {
        if ((u.total_tokens || 0) > avgTokens + 2 * stdDev) {
          anomalies.push({
            id: u.id,
            type: 'high_usage',
            severity: 'warning',
            provider: u.provider,
            model: u.model,
            tokens: u.total_tokens,
            expected: Math.round(avgTokens),
            deviation: ((u.total_tokens - avgTokens) / stdDev).toFixed(2) + ' std devs',
            timestamp: u.created_at
          });
        }
      });
    }

    return c.json({
      success: true,
      agent: 'cost-intelligence',
      action: 'anomaly_detection',
      timeframe_days: timeframe || 7,
      total_records_analyzed: usage?.length || 0,
      anomalies_found: anomalies.length,
      anomalies
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get('/api/v1/intelligence/summary', async (c) => {
  try {
    const supabase = getSupabase(c.env);

    // TODO: SECURITY - Extract org_id from JWT and enforce tenant isolation in queries
    const organizationId = 'default-org'; // Placeholder: should extract from JWT

    // Get usage summary by provider
    const { data: usage } = await supabase
      .from('usage')
      .select('provider, model, prompt_tokens, completion_tokens, total_tokens')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Aggregate by provider
    const byProvider = {};
    usage?.forEach(u => {
      if (!byProvider[u.provider]) {
        byProvider[u.provider] = { requests: 0, tokens: 0, models: new Set() };
      }
      byProvider[u.provider].requests++;
      byProvider[u.provider].tokens += u.total_tokens || 0;
      byProvider[u.provider].models.add(u.model);
    });

    // Convert sets to arrays
    Object.keys(byProvider).forEach(p => {
      byProvider[p].models = Array.from(byProvider[p].models);
    });

    return c.json({
      success: true,
      period: '30d',
      total_requests: usage?.length || 0,
      total_tokens: usage?.reduce((sum, u) => sum + (u.total_tokens || 0), 0) || 0,
      by_provider: byProvider
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===================================
// OPTIMIZATION AGENT
// ===================================

app.get('/api/v1/optimizations', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const minSavings = parseInt(c.req.query('min_savings') || '0');

    // TODO: SECURITY - Extract org_id from JWT and enforce tenant isolation in queries
    const organizationId = 'default-org'; // Placeholder: should extract from JWT

    // Get recent usage patterns
    const { data: usage } = await supabase
      .from('usage')
      .select('*')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Generate optimization recommendations
    const optimizations = [];

    // Check for model downgrade opportunities
    const gpt4Usage = usage?.filter(u => u.model?.includes('gpt-4') && !u.model?.includes('mini')) || [];
    if (gpt4Usage.length > 10) {
      optimizations.push({
        id: 'opt-model-downgrade',
        type: 'model_optimization',
        title: 'Switch simple queries to GPT-4o-mini',
        description: `${gpt4Usage.length} requests used GPT-4 that may work with GPT-4o-mini`,
        estimated_savings: gpt4Usage.length * 0.02, // ~$0.02 per request saved
        confidence: 0.75,
        effort: 'low',
        action: 'Configure routing rules in gateway'
      });
    }

    // Check for batching opportunities
    const rapidRequests = usage?.filter((u, i, arr) => {
      if (i === 0) return false;
      const prev = new Date(arr[i-1].created_at);
      const curr = new Date(u.created_at);
      return (curr - prev) < 1000; // Within 1 second
    }) || [];

    if (rapidRequests.length > 5) {
      optimizations.push({
        id: 'opt-batching',
        type: 'request_optimization',
        title: 'Enable request batching',
        description: `${rapidRequests.length} rapid sequential requests could be batched`,
        estimated_savings: rapidRequests.length * 0.001,
        confidence: 0.85,
        effort: 'medium',
        action: 'Enable batch mode in client SDK'
      });
    }

    // Check for caching opportunities
    optimizations.push({
      id: 'opt-semantic-cache',
      type: 'infrastructure',
      title: 'Enable semantic caching',
      description: 'Similar queries can be served from cache',
      estimated_savings: (usage?.length || 0) * 0.15 * 0.005,
      confidence: 0.70,
      effort: 'medium',
      action: 'Enable semantic cache in gateway settings'
    });

    return c.json({
      success: true,
      agent: 'optimization',
      total_optimizations: optimizations.length,
      total_potential_savings: optimizations.reduce((sum, o) => sum + o.estimated_savings, 0).toFixed(2),
      optimizations: optimizations.filter(o => o.estimated_savings >= minSavings)
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===================================
// FORECASTING AGENT
// ===================================

app.get('/api/v1/forecast', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const monthsAhead = parseInt(c.req.query('months') || '3');
    const scenario = c.req.query('scenario') || 'baseline';

    // TODO: SECURITY - Extract org_id from JWT and enforce tenant isolation in queries
    const organizationId = 'default-org'; // Placeholder: should extract from JWT

    // Get historical data
    const { data: usage } = await supabase
      .from('usage')
      .select('*')
      .order('created_at', { ascending: true });

    // Simple forecasting based on trend
    const dailyUsage = {};
    usage?.forEach(u => {
      const day = u.created_at.split('T')[0];
      if (!dailyUsage[day]) dailyUsage[day] = { tokens: 0, requests: 0 };
      dailyUsage[day].tokens += u.total_tokens || 0;
      dailyUsage[day].requests++;
    });

    const days = Object.keys(dailyUsage).sort();
    const recentDays = days.slice(-30);
    const avgDaily = recentDays.reduce((sum, d) => sum + dailyUsage[d].tokens, 0) / (recentDays.length || 1);

    // Growth rate scenarios
    const growthRates = {
      conservative: 0.05,
      baseline: 0.15,
      aggressive: 0.30
    };

    const growthRate = growthRates[scenario] || 0.15;

    // Generate forecast
    const forecast = [];
    let currentMonthly = avgDaily * 30;

    for (let i = 1; i <= monthsAhead; i++) {
      currentMonthly = currentMonthly * (1 + growthRate / 12);
      const estimatedCost = (currentMonthly / 1000) * 0.002; // Rough cost estimate

      forecast.push({
        month: i,
        label: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7),
        projected_tokens: Math.round(currentMonthly),
        estimated_cost: estimatedCost.toFixed(2),
        confidence_interval: {
          low: (estimatedCost * 0.8).toFixed(2),
          high: (estimatedCost * 1.2).toFixed(2)
        }
      });
    }

    return c.json({
      success: true,
      agent: 'forecasting',
      scenario,
      growth_rate: (growthRate * 100) + '%',
      current_monthly_tokens: Math.round(avgDaily * 30),
      forecast
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===================================
// POLICY & COMPLIANCE AGENT
// ===================================

app.get('/api/v1/policies/compliance', async (c) => {
  try {
    const supabase = getSupabase(c.env);

    // TODO: SECURITY - Extract org_id from JWT and enforce tenant isolation in queries
    const organizationId = 'default-org'; // Placeholder: should extract from JWT

    // Get policies and check compliance
    const { data: policies } = await supabase
      .from('policies')
      .select('*')
      .eq('active', true);

    const { data: usage } = await supabase
      .from('usage')
      .select('*')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Check each policy
    const compliance = {
      total_policies: policies?.length || 0,
      compliant: 0,
      violations: [],
      warnings: []
    };

    // Default policies if none configured
    const defaultPolicies = [
      { name: 'Monthly Token Limit', type: 'limit', threshold: 1000000, metric: 'total_tokens' },
      { name: 'Provider Diversity', type: 'diversity', min_providers: 2 }
    ];

    const checkPolicies = policies?.length ? policies : defaultPolicies;

    checkPolicies.forEach(policy => {
      if (policy.type === 'limit') {
        const total = usage?.reduce((sum, u) => sum + (u[policy.metric] || 0), 0) || 0;
        if (total > policy.threshold) {
          compliance.violations.push({
            policy: policy.name,
            current: total,
            limit: policy.threshold,
            severity: 'high'
          });
        } else if (total > policy.threshold * 0.8) {
          compliance.warnings.push({
            policy: policy.name,
            current: total,
            limit: policy.threshold,
            usage_percent: ((total / policy.threshold) * 100).toFixed(1)
          });
          compliance.compliant++;
        } else {
          compliance.compliant++;
        }
      }
    });

    return c.json({
      success: true,
      agent: 'policy',
      period: '30d',
      compliance,
      overall_status: compliance.violations.length > 0 ? 'non-compliant' :
                      compliance.warnings.length > 0 ? 'warning' : 'compliant'
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===================================
// BUDGET ENFORCEMENT (HTTP 402)
// ===================================

app.post('/api/v1/budget/check', async (c) => {
  try {
    const { organization_id, estimated_cost } = await c.req.json();
    const supabase = getSupabase(c.env);

    // SECURITY: Validate that requestor is authorized for this organization
    // TODO: Verify organization_id matches JWT payload org_id
    if (!organization_id) {
      return c.json({ success: false, error: 'organization_id is required' }, 400);
    }

    // Get budget configuration
    const { data: budget } = await supabase
      .from('budgets')
      .select('*')
      .eq('organization_id', organization_id)
      .single();

    if (!budget) {
      return c.json({ success: true, allowed: true, reason: 'No budget configured' });
    }

    // Check current spend
    const { data: spend } = await supabase
      .from('usage')
      .select('total_tokens')
      .eq('organization_id', organization_id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const currentSpend = spend?.reduce((sum, s) => sum + (s.total_tokens || 0), 0) || 0;
    const estimatedTotal = currentSpend + (estimated_cost || 0);

    // Hard cap enforcement
    if (budget.hard_cap && estimatedTotal > budget.hard_cap) {
      return c.json({
        success: true,
        allowed: false,
        enforcement: 'hard_cap',
        message: 'Budget exceeded - request blocked',
        current_spend: currentSpend,
        budget_limit: budget.hard_cap,
        overage: estimatedTotal - budget.hard_cap
      }, 402); // Payment Required
    }

    // Soft cap warning
    if (budget.soft_cap && estimatedTotal > budget.soft_cap) {
      return c.json({
        success: true,
        allowed: true,
        warning: true,
        message: 'Approaching budget limit',
        current_spend: currentSpend,
        soft_cap: budget.soft_cap,
        remaining: budget.hard_cap - currentSpend
      });
    }

    return c.json({
      success: true,
      allowed: true,
      current_spend: currentSpend,
      remaining: (budget.hard_cap || budget.soft_cap) - currentSpend
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===================================
// EXECUTE ANY AGENT
// ===================================

app.post('/api/v1/agents/:agentId/execute', async (c) => {
  try {
    const agentId = c.req.param('agentId');
    const { action, params } = await c.req.json();

    // TODO: SECURITY - Extract org_id from JWT and enforce tenant isolation
    const organizationId = 'default-org'; // Placeholder: should extract from JWT

    const agent = AGENT_REGISTRY[agentId];
    if (!agent) {
      return c.json({ success: false, error: 'Agent not found' }, 404);
    }

    // Route to appropriate handler based on agent
    const routes = {
      'cost-intelligence': '/api/v1/intelligence/anomalies',
      'optimization': '/api/v1/optimizations',
      'forecasting': '/api/v1/forecast',
      'policy': '/api/v1/policies/compliance',
      'finault-pal': '/api/v1/chat'
    };

    const route = routes[agentId];
    if (!route) {
      return c.json({
        success: true,
        agent: agentId,
        message: `Agent ${agentId} acknowledged. Full implementation coming soon.`,
        requested_action: action,
        params
      });
    }

    // Redirect to the actual endpoint
    return c.json({
      success: true,
      agent: agentId,
      redirect: route,
      message: `Use ${route} for this agent's functionality`
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Export for Cloudflare Workers
export default app;
