/**
 * Finault Embeddable Margin Badge
 * Usage: <script src="https://finault.ai/badge.js" data-org="org_xxx" data-key="fk_live_xxx"></script>
 * Drops a real-time margin indicator into any internal dashboard.
 */
(function() {
  'use strict';

  const script = document.currentScript;
  const orgId = script.getAttribute('data-org');
  const apiKey = script.getAttribute('data-key');
  const theme = script.getAttribute('data-theme') || 'dark';
  const position = script.getAttribute('data-position') || 'bottom-right';

  if (!orgId || !apiKey) {
    console.warn('[Finault Badge] Missing data-org or data-key attribute');
    return;
  }

  const API_BASE = 'https://api.finault.ai';

  // Create badge element
  const badge = document.createElement('div');
  badge.id = 'finault-badge';

  const isDark = theme === 'dark';
  const bg = isDark ? '#111827' : '#ffffff';
  const text = isDark ? '#e5e7eb' : '#1f2937';
  const border = isDark ? '#374151' : '#e5e7eb';
  const accent = '#f97316';

  // Position styles
  const posStyles = {
    'bottom-right': 'bottom: 16px; right: 16px;',
    'bottom-left': 'bottom: 16px; left: 16px;',
    'top-right': 'top: 16px; right: 16px;',
    'top-left': 'top: 16px; left: 16px;',
  };

  badge.style.cssText = `
    position: fixed;
    ${posStyles[position] || posStyles['bottom-right']}
    z-index: 99999;
    background: ${bg};
    color: ${text};
    border: 1px solid ${border};
    border-radius: 8px;
    padding: 8px 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  badge.innerHTML = `
    <span style="width:8px;height:8px;border-radius:50%;background:${accent};display:inline-block;"></span>
    <span id="finault-badge-text">Loading...</span>
    <span style="color:${accent};font-weight:600;" id="finault-badge-score"></span>
  `;

  document.body.appendChild(badge);

  // Fetch data
  async function updateBadge() {
    try {
      const resp = await fetch(`${API_BASE}/v1/score`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!resp.ok) {
        document.getElementById('finault-badge-text').textContent = 'Finault';
        document.getElementById('finault-badge-score').textContent = '—';
        return;
      }

      const data = await resp.json();
      const score = data.score || 0;
      const grade = data.grade || '—';
      const margins = data.margins || {};
      const aiPct = margins.ai_cost_percent || 0;

      // Color based on score
      let scoreColor = '#ef4444'; // Red
      if (score >= 80) scoreColor = '#22c55e'; // Green
      else if (score >= 60) scoreColor = '#f97316'; // Orange
      else if (score >= 40) scoreColor = '#eab308'; // Yellow

      document.getElementById('finault-badge-text').textContent = `AI Margin: ${aiPct.toFixed(1)}%`;
      const scoreEl = document.getElementById('finault-badge-score');
      scoreEl.textContent = grade;
      scoreEl.style.color = scoreColor;

      // Pulse if score is low
      if (score < 40) {
        badge.style.borderColor = '#ef4444';
      }
    } catch (e) {
      document.getElementById('finault-badge-text').textContent = 'Finault';
      document.getElementById('finault-badge-score').textContent = '—';
    }
  }

  updateBadge();
  // Refresh every 5 minutes
  setInterval(updateBadge, 300000);

  // Click to expand
  let expanded = false;
  badge.addEventListener('click', function() {
    if (!expanded) {
      badge.style.padding = '12px 16px';
      badge.style.width = '220px';
      badge.style.flexDirection = 'column';
      badge.style.alignItems = 'flex-start';
      badge.innerHTML += `
        <div style="margin-top:8px;font-size:11px;opacity:0.7;width:100%;">
          <div>Powered by <a href="https://finault.ai" target="_blank" style="color:${accent};text-decoration:none;">Finault</a></div>
          <div style="margin-top:4px;">AI Economics Verified</div>
        </div>
      `;
      expanded = true;
    }
  });
})();
