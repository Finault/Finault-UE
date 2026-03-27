/**
 * FINAULT STATUS PAGE — status.finault.ai
 * ═══════════════════════════════════════════
 * Build 6: Standalone Cloudflare Worker
 * Checks: Gateway, Receipt Page, Marketing Site
 * Stores results in KV, renders HTML status page
 */

const CHECKS = [
  { name: 'Gateway API', url: 'https://api.finault.ai/health', timeout: 5000 },
  { name: 'Receipt Page', url: 'https://api.finault.ai/seal/test/json', timeout: 5000 },
  { name: 'Marketing Site', url: 'https://finault.ai', timeout: 5000 },
  { name: 'Dashboard', url: 'https://app.finault.ai', timeout: 5000 },
];

export default {
  async scheduled(event, env, ctx) {
    const results = await Promise.all(CHECKS.map(async (check) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), check.timeout);
        const resp = await fetch(check.url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return {
          name: check.name,
          status: resp.ok ? 'up' : 'degraded',
          latency: Date.now() - start,
          statusCode: resp.status,
          timestamp: new Date().toISOString(),
        };
      } catch (e) {
        return {
          name: check.name,
          status: 'down',
          latency: Date.now() - start,
          error: e.message,
          timestamp: new Date().toISOString(),
        };
      }
    }));

    const key = `status:${new Date().toISOString().slice(0, 16)}`;
    await env.STATUS_KV.put(key, JSON.stringify(results), { expirationTtl: 86400 * 90 });
    await env.STATUS_KV.put('status:latest', JSON.stringify(results));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // JSON API
    if (url.pathname === '/api/status') {
      const latest = JSON.parse(await env.STATUS_KV.get('status:latest') || '[]');
      return new Response(JSON.stringify(latest), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const latest = JSON.parse(await env.STATUS_KV.get('status:latest') || '[]');

    // Get last 24 hours for uptime calc
    const history = [];
    const now = new Date();
    for (let i = 0; i < 288; i++) { // Every 5 minutes for 24h
      const t = new Date(now - i * 5 * 60000);
      const key = `status:${t.toISOString().slice(0, 16)}`;
      const data = await env.STATUS_KV.get(key);
      if (data) history.push(JSON.parse(data));
    }

    const allUp = latest.length > 0 && latest.every(c => c.status === 'up');
    const totalChecks = history.flat().length;
    const upChecks = history.flat().filter(c => c.status === 'up').length;
    const uptimePct = totalChecks > 0 ? ((upChecks / totalChecks) * 100).toFixed(2) : '100.00';

    const checks = latest.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #1a1a1a;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${c.status === 'up' ? '#22c55e' : c.status === 'degraded' ? '#eab308' : '#ef4444'};flex-shrink:0;"></span>
          <span style="color:#e4e4e7;font-size:14px;">${c.name}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;">
          <span style="color:#71717a;font-size:13px;font-variant-numeric:tabular-nums;">${c.latency}ms</span>
          <span style="color:${c.status === 'up' ? '#22c55e' : c.status === 'degraded' ? '#eab308' : '#ef4444'};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${c.status}</span>
        </div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Finault Status</title>
<meta name="description" content="Real-time status for Finault — the economic proof layer for AI infrastructure">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0a0a0a;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;padding:40px 20px;}
  .container{max-width:640px;margin:0 auto;}
  a{color:#34d399;text-decoration:none;}
  a:hover{text-decoration:underline;}
</style>
</head><body>
<div class="container">
  <div style="margin-bottom:40px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div style="width:6px;height:6px;border-radius:50%;background:#34d399;"></div>
      <span style="font-family:monospace;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#a1a1aa;">FINAULT</span>
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:8px 0 4px;">System Status</h1>
    <p style="color:#71717a;font-size:13px;">The economic proof layer for AI infrastructure</p>
  </div>

  <div style="background:${allUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'};border:1px solid ${allUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'};border-radius:10px;padding:16px 20px;margin-bottom:32px;display:flex;align-items:center;gap:12px;">
    <span style="width:12px;height:12px;border-radius:50%;background:${allUp ? '#22c55e' : '#ef4444'};flex-shrink:0;"></span>
    <span style="font-weight:600;font-size:14px;color:${allUp ? '#22c55e' : '#ef4444'};">${allUp ? 'All Systems Operational' : 'Degraded Performance'}</span>
  </div>

  <div style="margin-bottom:32px;">
    ${checks}
  </div>

  <div style="display:flex;justify-content:space-between;color:#52525b;font-size:13px;padding:16px 0;border-top:1px solid #1a1a1a;">
    <span>24h uptime: <strong style="color:#a1a1aa;">${uptimePct}%</strong></span>
    <span>Last checked: ${latest[0]?.timestamp ? new Date(latest[0].timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'never'}</span>
  </div>

  <div style="margin-top:40px;color:#3f3f46;font-size:12px;text-align:center;display:flex;justify-content:center;gap:16px;">
    <a href="https://finault.ai">finault.ai</a>
    <span>·</span>
    <a href="https://api.finault.ai/health">API Health</a>
    <span>·</span>
    <a href="https://finault.ai/docs">Documentation</a>
  </div>
</div>
</body></html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=30',
      }
    });
  }
};
