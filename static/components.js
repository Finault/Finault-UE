/**
 * Finault Embeddable Components
 * Web Components (Custom Elements) for embedding Finault analytics in external dashboards
 * Usage: <script src="https://finault.ai/components.js"></script>
 * Then use: <finault-margin-chart api-key="..." org-id="..." ></finault-margin-chart>
 */

(function() {
  'use strict';

  const API_BASE = 'https://api.finault.ai';

  // Utility: Create a styled element with shadow DOM
  function createShadowElement(tag, styles, html) {
    const el = document.createElement(tag);
    const shadow = el.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;
    shadow.appendChild(style);
    const container = document.createElement('div');
    container.innerHTML = html;
    shadow.appendChild(container);
    return el;
  }

  // Utility: Fetch with error handling
  async function fetchWithAuth(url, apiKey) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error('[Finault]', err);
      throw err;
    }
  }

  // Utility: Theme colors
  function getThemeColors(theme = 'light') {
    if (theme === 'dark') {
      return {
        bg: '#0f172a',
        text: '#f1f5f9',
        border: '#334155',
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        success: '#10b981',
        danger: '#ef4444',
        accent: '#06b6d4'
      };
    }
    return {
      bg: '#ffffff',
      text: '#1e293b',
      border: '#cbd5e1',
      primary: '#2563eb',
      secondary: '#7c3aed',
      success: '#059669',
      danger: '#dc2626',
      accent: '#0891b2'
    };
  }

  // ===== Component 1: Margin Chart =====
  class FinaultMarginChart extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      const apiKey = this.getAttribute('api-key');
      const orgId = this.getAttribute('org-id');
      const theme = this.getAttribute('theme') || 'light';

      if (!apiKey || !orgId) {
        this.renderError('Missing required attributes: api-key, org-id');
        return;
      }

      this.render(theme);
      this.fetchAndRender(apiKey, orgId, theme);
    }

    render(theme) {
      const colors = getThemeColors(theme);
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .container {
          background: ${colors.bg};
          color: ${colors.text};
          border: 1px solid ${colors.border};
          border-radius: 8px;
          padding: 20px;
          min-height: 300px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .title {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }
        .loading, .error {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 250px;
        }
        .loading {
          font-size: 14px;
          color: ${colors.text}80;
        }
        .error {
          color: ${colors.danger};
          font-size: 14px;
        }
        canvas {
          max-width: 100%;
          height: auto;
        }
      `;
      this.shadowRoot.appendChild(style);

      const container = document.createElement('div');
      container.className = 'container';
      container.innerHTML = `
        <div class="header">
          <h3 class="title">Margin Trend (30 Days)</h3>
        </div>
        <div class="loading">Loading...</div>
      `;
      this.shadowRoot.appendChild(container);
    }

    async fetchAndRender(apiKey, orgId, theme) {
      try {
        // Mock data for demo - replace with actual API call
        const data = this.generateMockMarginData();
        this.renderChart(data, theme);
      } catch (err) {
        this.renderError(err.message);
      }
    }

    generateMockMarginData() {
      const days = 30;
      const data = [];
      const today = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        data.push({
          date: date.toISOString().split('T')[0],
          margin: 65 + Math.random() * 15 + Math.sin(i / 5) * 5
        });
      }
      return data;
    }

    renderChart(data, theme) {
      const container = this.shadowRoot.querySelector('.container');
      const loadingDiv = container.querySelector('.loading');

      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 250;
      loadingDiv.replaceWith(canvas);

      const ctx = canvas.getContext('2d');
      const colors = getThemeColors(theme);

      // Calculate dimensions
      const padding = 40;
      const chartWidth = canvas.width - padding * 2;
      const chartHeight = canvas.height - padding * 2;
      const maxMargin = Math.max(...data.map(d => d.margin));
      const minMargin = Math.min(...data.map(d => d.margin));
      const range = maxMargin - minMargin || 1;

      // Draw background
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid lines
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
      }

      // Draw line
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 2;
      ctx.beginPath();

      data.forEach((point, idx) => {
        const x = padding + (chartWidth / (data.length - 1)) * idx;
        const y = padding + chartHeight - ((point.margin - minMargin) / range) * chartHeight;

        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw area under curve
      ctx.fillStyle = colors.primary + '20';
      ctx.lineTo(canvas.width - padding, canvas.height - padding);
      ctx.lineTo(padding, canvas.height - padding);
      ctx.closePath();
      ctx.fill();

      // Draw axes
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, canvas.height - padding);
      ctx.lineTo(canvas.width - padding, canvas.height - padding);
      ctx.stroke();

      // Draw labels
      ctx.fillStyle = colors.text;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';

      // Y-axis labels
      for (let i = 0; i <= 4; i++) {
        const value = minMargin + (range / 4) * i;
        const y = padding + (chartHeight / 4) * (4 - i);
        ctx.fillText(Math.round(value) + '%', padding - 8, y + 4);
      }

      // X-axis labels (show first, middle, last)
      ctx.textAlign = 'center';
      const indices = [0, Math.floor((data.length - 1) / 2), data.length - 1];
      indices.forEach(idx => {
        const x = padding + (chartWidth / (data.length - 1)) * idx;
        ctx.fillText(data[idx].date, x, canvas.height - padding + 20);
      });
    }

    renderError(message) {
      const container = this.shadowRoot.querySelector('.container');
      if (container) {
        const loadingDiv = container.querySelector('.loading');
        if (loadingDiv) {
          loadingDiv.className = 'error';
          loadingDiv.textContent = 'Error: ' + message;
        }
      }
    }
  }

  // ===== Component 2: Cost Breakdown =====
  class FinaultCostBreakdown extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      const apiKey = this.getAttribute('api-key');
      const orgId = this.getAttribute('org-id');
      const theme = this.getAttribute('theme') || 'light';

      if (!apiKey || !orgId) {
        this.renderError('Missing required attributes: api-key, org-id');
        return;
      }

      this.render(theme);
      this.fetchAndRender(apiKey, orgId, theme);
    }

    render(theme) {
      const colors = getThemeColors(theme);
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .container {
          background: ${colors.bg};
          color: ${colors.text};
          border: 1px solid ${colors.border};
          border-radius: 8px;
          padding: 20px;
        }
        .title {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 16px 0;
        }
        .content {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        .chart-wrapper {
          flex: 0 0 150px;
          height: 150px;
        }
        .legend {
          flex: 1;
          min-width: 200px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
        }
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          margin-right: 8px;
        }
        .legend-label {
          flex: 1;
        }
        .legend-value {
          font-weight: 600;
          text-align: right;
        }
        .loading, .error {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 150px;
          font-size: 14px;
        }
        .error {
          color: ${colors.danger};
        }
      `;
      this.shadowRoot.appendChild(style);

      const container = document.createElement('div');
      container.className = 'container';
      container.innerHTML = `
        <h3 class="title">Cost Breakdown by Provider</h3>
        <div class="loading">Loading...</div>
      `;
      this.shadowRoot.appendChild(container);
    }

    async fetchAndRender(apiKey, orgId, theme) {
      try {
        const data = this.generateMockCostData();
        this.renderChart(data, theme);
      } catch (err) {
        this.renderError(err.message);
      }
    }

    generateMockCostData() {
      return [
        { provider: 'OpenAI', cost: 4250, percentage: 42.5 },
        { provider: 'Anthropic', cost: 3100, percentage: 31 },
        { provider: 'Google', cost: 1800, percentage: 18 },
        { provider: 'Others', cost: 850, percentage: 8.5 }
      ];
    }

    renderChart(data, theme) {
      const container = this.shadowRoot.querySelector('.container');
      const loadingDiv = container.querySelector('.loading');

      const colors = getThemeColors(theme);
      const chartColors = [
        colors.primary,
        colors.secondary,
        colors.accent,
        '#94a3b8'
      ];

      const content = document.createElement('div');
      content.className = 'content';

      // Donut chart
      const chartWrapper = document.createElement('div');
      chartWrapper.className = 'chart-wrapper';
      const canvas = document.createElement('canvas');
      canvas.width = 150;
      canvas.height = 150;
      chartWrapper.appendChild(canvas);

      // Draw donut
      const ctx = canvas.getContext('2d');
      const centerX = 75;
      const centerY = 75;
      const radius = 60;
      const innerRadius = 35;

      let currentAngle = -Math.PI / 2;
      data.forEach((item, idx) => {
        const sliceAngle = (item.percentage / 100) * 2 * Math.PI;

        // Draw slice
        ctx.fillStyle = chartColors[idx];
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.lineTo(
          centerX + Math.cos(currentAngle + sliceAngle) * innerRadius,
          centerY + Math.sin(currentAngle + sliceAngle) * innerRadius
        );
        ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
        ctx.closePath();
        ctx.fill();

        currentAngle += sliceAngle;
      });

      // Center text
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const totalCost = data.reduce((sum, d) => sum + d.cost, 0);
      ctx.fillText('$' + totalCost.toLocaleString(), centerX, centerY - 8);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = colors.text + '80';
      ctx.fillText('Total', centerX, centerY + 10);

      content.appendChild(chartWrapper);

      // Legend
      const legend = document.createElement('div');
      legend.className = 'legend';
      data.forEach((item, idx) => {
        const item_el = document.createElement('div');
        item_el.className = 'legend-item';
        item_el.innerHTML = `
          <div class="legend-color" style="background-color: ${chartColors[idx]}"></div>
          <div class="legend-label">${item.provider}</div>
          <div class="legend-value">$${item.cost.toLocaleString()}</div>
        `;
        legend.appendChild(item_el);
      });
      content.appendChild(legend);

      loadingDiv.replaceWith(content);
    }

    renderError(message) {
      const container = this.shadowRoot.querySelector('.container');
      if (container) {
        const loadingDiv = container.querySelector('.loading');
        if (loadingDiv) {
          loadingDiv.className = 'error';
          loadingDiv.textContent = 'Error: ' + message;
        }
      }
    }
  }

  // ===== Component 3: Finault Score =====
  class FinaultScore extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      const apiKey = this.getAttribute('api-key');
      const orgId = this.getAttribute('org-id');
      const theme = this.getAttribute('theme') || 'light';

      if (!apiKey || !orgId) {
        this.renderError('Missing required attributes: api-key, org-id');
        return;
      }

      this.render(theme);
      this.fetchAndRender(apiKey, orgId, theme);
    }

    render(theme) {
      const colors = getThemeColors(theme);
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .container {
          background: ${colors.bg};
          color: ${colors.text};
          border: 1px solid ${colors.border};
          border-radius: 8px;
          padding: 20px;
          text-align: center;
        }
        .title {
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 16px 0;
          opacity: 0.8;
        }
        .gauge-wrapper {
          position: relative;
          width: 200px;
          height: 200px;
          margin: 0 auto 16px;
        }
        canvas {
          width: 100%;
          height: 100%;
        }
        .score-text {
          font-size: 28px;
          font-weight: 700;
          margin: 16px 0 4px 0;
        }
        .score-label {
          font-size: 13px;
          opacity: 0.7;
          margin-bottom: 8px;
        }
        .loading, .error {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          font-size: 14px;
        }
        .error {
          color: ${colors.danger};
        }
      `;
      this.shadowRoot.appendChild(style);

      const container = document.createElement('div');
      container.className = 'container';
      container.innerHTML = `
        <h3 class="title">Finault Score</h3>
        <div class="loading">Loading...</div>
      `;
      this.shadowRoot.appendChild(container);
    }

    async fetchAndRender(apiKey, orgId, theme) {
      try {
        const score = this.generateMockScore();
        this.renderGauge(score, theme);
      } catch (err) {
        this.renderError(err.message);
      }
    }

    generateMockScore() {
      return 78;
    }

    renderGauge(score, theme) {
      const container = this.shadowRoot.querySelector('.container');
      const loadingDiv = container.querySelector('.loading');

      const colors = getThemeColors(theme);

      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="gauge-wrapper">
          <canvas id="gauge"></canvas>
        </div>
        <p class="score-label">Organization Efficiency</p>
      `;
      loadingDiv.replaceWith(wrapper);

      const canvas = wrapper.querySelector('canvas');
      canvas.width = 200;
      canvas.height = 200;

      const ctx = canvas.getContext('2d');
      const centerX = 100;
      const centerY = 100;
      const radius = 80;

      // Determine color based on score
      let scoreColor;
      if (score >= 80) {
        scoreColor = colors.success;
      } else if (score >= 60) {
        scoreColor = '#f59e0b';
      } else {
        scoreColor = colors.danger;
      }

      // Draw background circle
      ctx.fillStyle = colors.border;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();

      // Draw score arc
      ctx.fillStyle = scoreColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, -Math.PI, -Math.PI + (score / 100) * Math.PI, false);
      ctx.lineTo(centerX, centerY);
      ctx.closePath();
      ctx.fill();

      // Draw center circle (cutout)
      ctx.fillStyle = colors.bg;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 15, 0, 2 * Math.PI);
      ctx.fill();

      // Draw score text
      ctx.fillStyle = scoreColor;
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(score, centerX, centerY - 10);

      ctx.fillStyle = colors.text;
      ctx.font = '16px sans-serif';
      ctx.fillText('/100', centerX, centerY + 20);
    }

    renderError(message) {
      const container = this.shadowRoot.querySelector('.container');
      if (container) {
        const loadingDiv = container.querySelector('.loading');
        if (loadingDiv) {
          loadingDiv.className = 'error';
          loadingDiv.textContent = 'Error: ' + message;
        }
      }
    }
  }

  // ===== Component 4: User Table =====
  class FinaultUserTable extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      const apiKey = this.getAttribute('api-key');
      const orgId = this.getAttribute('org-id');
      const limit = this.getAttribute('limit') || '10';
      const theme = this.getAttribute('theme') || 'light';

      if (!apiKey || !orgId) {
        this.renderError('Missing required attributes: api-key, org-id');
        return;
      }

      this.render(theme);
      this.fetchAndRender(apiKey, orgId, parseInt(limit), theme);
    }

    render(theme) {
      const colors = getThemeColors(theme);
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .container {
          background: ${colors.bg};
          color: ${colors.text};
          border: 1px solid ${colors.border};
          border-radius: 8px;
          padding: 20px;
          overflow-x: auto;
        }
        .title {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 16px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          text-align: left;
          padding: 12px 8px;
          border-bottom: 2px solid ${colors.border};
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          user-select: none;
        }
        th:hover {
          background: ${colors.border}40;
        }
        td {
          padding: 12px 8px;
          border-bottom: 1px solid ${colors.border};
          font-size: 13px;
        }
        tbody tr:hover {
          background: ${colors.border}20;
        }
        .numeric {
          text-align: right;
          font-family: 'Courier New', monospace;
        }
        .loading, .error {
          padding: 20px;
          text-align: center;
          font-size: 14px;
        }
        .error {
          color: ${colors.danger};
        }
        .sort-arrow {
          font-size: 12px;
          margin-left: 4px;
          opacity: 0.5;
        }
      `;
      this.shadowRoot.appendChild(style);

      const container = document.createElement('div');
      container.className = 'container';
      container.innerHTML = `
        <h3 class="title">User Economics</h3>
        <div class="loading">Loading...</div>
      `;
      this.shadowRoot.appendChild(container);
    }

    async fetchAndRender(apiKey, orgId, limit, theme) {
      try {
        const data = this.generateMockUserData(limit);
        this.renderTable(data, theme);
      } catch (err) {
        this.renderError(err.message);
      }
    }

    generateMockUserData(limit) {
      const names = ['Alice Chen', 'Bob Smith', 'Carol Davis', 'David Kumar', 'Emma Wilson', 'Frank Johnson', 'Grace Lee', 'Henry Zhang', 'Ivy Park', 'Jack Anderson'];
      const data = names.slice(0, limit).map((name, idx) => ({
        id: 'usr_' + idx,
        name: name,
        email: name.toLowerCase().replace(' ', '.') + '@example.com',
        requests: Math.floor(Math.random() * 10000) + 100,
        spend: Math.floor(Math.random() * 5000) + 50,
        margin: Math.floor(Math.random() * 40) + 60
      }));
      return data.sort((a, b) => b.spend - a.spend);
    }

    renderTable(data, theme) {
      const container = this.shadowRoot.querySelector('.container');
      const loadingDiv = container.querySelector('.loading');

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const headers = [
        { label: 'User', key: 'name' },
        { label: 'Email', key: 'email' },
        { label: 'Requests', key: 'requests' },
        { label: 'Cost', key: 'spend' },
        { label: 'Margin %', key: 'margin' }
      ];

      headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h.label;
        th.setAttribute('data-key', h.key);
        th.style.cursor = 'pointer';
        th.onclick = () => this.sortTable(h.key, data, table);
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      data.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td class="numeric">${user.requests.toLocaleString()}</td>
          <td class="numeric">$${user.spend.toFixed(2)}</td>
          <td class="numeric">${user.margin}%</td>
        `;
        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      loadingDiv.replaceWith(table);
    }

    sortTable(key, data, table) {
      data.sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        return typeof aVal === 'string'
          ? aVal.localeCompare(bVal)
          : bVal - aVal;
      });

      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      data.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td class="numeric">${user.requests.toLocaleString()}</td>
          <td class="numeric">$${user.spend.toFixed(2)}</td>
          <td class="numeric">${user.margin}%</td>
        `;
        tbody.appendChild(row);
      });
    }

    renderError(message) {
      const container = this.shadowRoot.querySelector('.container');
      if (container) {
        const loadingDiv = container.querySelector('.loading');
        if (loadingDiv) {
          loadingDiv.className = 'error';
          loadingDiv.textContent = 'Error: ' + message;
        }
      }
    }
  }

  // Register all components
  if (!customElements.get('finault-margin-chart')) {
    customElements.define('finault-margin-chart', FinaultMarginChart);
  }
  if (!customElements.get('finault-cost-breakdown')) {
    customElements.define('finault-cost-breakdown', FinaultCostBreakdown);
  }
  if (!customElements.get('finault-score')) {
    customElements.define('finault-score', FinaultScore);
  }
  if (!customElements.get('finault-user-table')) {
    customElements.define('finault-user-table', FinaultUserTable);
  }

  // Expose in global scope
  window.FinaultComponents = {
    version: '1.0.0',
    components: ['finault-margin-chart', 'finault-cost-breakdown', 'finault-score', 'finault-user-table']
  };

})();
