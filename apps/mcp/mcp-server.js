/**
 * FINAULT MCP SERVER — Build 23
 * JSON-RPC over HTTP for Claude Desktop integration
 */

const MCP_TOOLS = [
  {
    name: 'finault_margins',
    description: 'Get per-customer AI margins for the current period',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Period in YYYY-MM format' },
        customer_id: { type: 'string', description: 'Optional: specific customer' },
      }
    }
  },
  {
    name: 'finault_dark_debt',
    description: 'Get Dark Debt alerts for recent AI outputs',
    inputSchema: {
      type: 'object',
      properties: {
        min_score: { type: 'number', description: 'Minimum Dark Debt score (0-100)' },
      }
    }
  },
  {
    name: 'finault_pnl',
    description: 'Get the AI P&L statement for a period',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Period in YYYY-MM format' },
      }
    }
  },
  {
    name: 'finault_verify_seal',
    description: 'Verify a specific Finault seal by ID',
    inputSchema: {
      type: 'object',
      properties: {
        seal_id: { type: 'string', description: 'The seal ID to verify' },
      },
      required: ['seal_id']
    }
  },
  {
    name: 'finault_intelligence',
    description: 'Get the intelligence report with cost trends and recommendations',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Period in YYYY-MM format' },
      }
    }
  },
  {
    name: 'finault_margin_forensics',
    description: 'Explain why margins changed between periods',
    inputSchema: {
      type: 'object',
      properties: {
        current_period: { type: 'string' },
        prior_period: { type: 'string' },
      }
    }
  },
];

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();

      // MCP protocol: initialize
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'finault', version: '4.2.0' },
          }
        });
      }

      // List tools
      if (body.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: MCP_TOOLS }
        });
      }

      // Execute tool
      if (body.method === 'tools/call') {
        const { name, arguments: args } = body.params;
        const result = await executeTool(name, args || {}, env, request);
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        });
      }

      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32601, message: 'Method not found' }
      });
    } catch (e) {
      return Response.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: e.message }
      });
    }
  }
};

async function executeTool(name, args, env, request) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return { error: 'Database not configured' };

  // Extract org from auth header
  const authHeader = request.headers.get('Authorization');
  const orgId = env.DEFAULT_ORG_ID || 'demo'; // In production, resolve from auth

  const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` };

  switch (name) {
    case 'finault_margins': {
      const period = args.period || new Date().toISOString().slice(0, 7);
      let url = `${supabaseUrl}/rest/v1/seals?org_id=eq.${orgId}&timestamp=gte.${period}-01&select=customer_id,cost_usd,revenue_usd,margin_pct,margin_usd`;
      if (args.customer_id) url += `&customer_id=eq.${args.customer_id}`;
      const resp = await fetch(url, { headers });
      const seals = await resp.json();
      if (!Array.isArray(seals)) return { error: 'No data' };

      const byCustomer = {};
      seals.forEach(s => {
        const cid = s.customer_id || '__untagged__';
        if (!byCustomer[cid]) byCustomer[cid] = { revenue: 0, cost: 0, count: 0 };
        byCustomer[cid].revenue += s.revenue_usd || 0;
        byCustomer[cid].cost += s.cost_usd || 0;
        byCustomer[cid].count++;
      });

      return {
        period,
        customers: Object.entries(byCustomer).map(([id, d]) => ({
          customer_id: id,
          revenue: Math.round(d.revenue * 100) / 100,
          cost: Math.round(d.cost * 100) / 100,
          margin: Math.round((d.revenue - d.cost) * 100) / 100,
          margin_pct: d.revenue > 0 ? Math.round(((d.revenue - d.cost) / d.revenue) * 10000) / 100 : 0,
          transactions: d.count,
        })).sort((a, b) => b.revenue - a.revenue),
      };
    }

    case 'finault_dark_debt': {
      const minScore = args.min_score || 30;
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/seals?org_id=eq.${orgId}&dark_debt_score=gte.${minScore}&select=seal_id,dark_debt_score,dark_debt_risks,model,customer_id,timestamp&order=dark_debt_score.desc&limit=50`,
        { headers }
      );
      return await resp.json();
    }

    case 'finault_pnl':
    case 'finault_intelligence':
    case 'finault_margin_forensics':
    case 'finault_verify_seal':
      return { message: `Tool ${name} delegates to gateway API — use with authenticated gateway calls` };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
