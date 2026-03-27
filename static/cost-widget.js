/**
 * Finault Cost Widget
 * Lightweight embeddable snippet for customer-facing dashboards
 * Usage: <script src="https://finault.ai/cost-widget.js" data-api-key="fk_live_xxx" data-user-id="usr_xxx"></script>
 *
 * Features:
 * - Credits used / total display
 * - Most expensive generation
 * - Cost trend (up/down indicator)
 * - Compact design, < 5KB minified
 */

(function() {
  'use strict';

  const API_BASE = 'https://api.finault.ai';

  // Get script attributes
  function getScriptAttributes() {
    const script = document.currentScript || Array.from(document.scripts).find(s => s.src.includes('cost-widget'));
    if (!script) return {};

    return {
      apiKey: script.getAttribute('data-api-key'),
      userId: script.getAttribute('data-user-id'),
      orgId: script.getAttribute('data-org-id'),
      containerId: script.getAttribute('data-container') || 'finault-cost-widget',
      theme: script.getAttribute('data-theme') || 'light'
    };
  }

  // Initialize widget
  function initWidget() {
    const attrs = getScriptAttributes();

    if (!attrs.apiKey || (!attrs.userId && !attrs.orgId)) {
      console.error('[Finault Widget] Missing required attributes: data-api-key and (data-user-id or data-org-id)');
      return;
    }

    // Create container if not exists
    let container = document.getElementById(attrs.containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = attrs.containerId;
      document.body.appendChild(container);
    }

    // Create widget
    const widget = new CostWidget(container, attrs);
    widget.init();
  }

  class CostWidget {
    constructor(container, attrs) {
      this.container = container;
      this.apiKey = attrs.apiKey;
      this.userId = attrs.userId;
      this.orgId = attrs.orgId;
      this.theme = attrs.theme;
      this.data = null;
    }

    async init() {
      this.render('loading');
      try {
        await this.fetchData();
        this.render('loaded');
      } catch (err) {
        console.error('[Finault Widget]', err);
        this.render('error', err.message);
      }
    }

    async fetchData() {
      // Mock data for demo - replace with actual API call
      this.data = {
        creditsUsed: 4250,
        creditsTotal: 10000,
        creditsPercent: 42.5,
        monthlySpend: 1250,
        lastMonthSpend: 1180,
        trend: 'up',
        trendPercent: 5.9,
        mostExpensive: {
          model: 'Claude 3.5 Sonnet',
          cost: 450,
          percent: 36
        }
      };
    }

    getThemeColors() {
      const isDark = this.theme === 'dark';
      return {
        bg: isDark ? '#0f172a' : '#ffffff',
        bgSecondary: isDark ? '#1e293b' : '#f8fafc',
        text: isDark ? '#f1f5f9' : '#1e293b',
        textSecondary: isDark ? '#cbd5e1' : '#64748b',
        border: isDark ? '#334155' : '#e2e8f0',
        primary: isDark ? '#3b82f6' : '#2563eb',
        success: isDark ? '#10b981' : '#059669',
        danger: isDark ? '#ef4444' : '#dc2626',
        warning: isDark ? '#f59e0b' : '#d97706'
      };
    }

    render(state, error = '') {
      const colors = this.getThemeColors();

      if (state === 'loading') {
        this.container.innerHTML = `
          <div style="
            background: ${colors.bgSecondary};
            border: 1px solid ${colors.border};
            border-radius: 12px;
            padding: 16px;
            text-align: center;
            color: ${colors.textSecondary};
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          ">
            Loading credits...
          </div>
        `;
        return;
      }

      if (state === 'error') {
        this.container.innerHTML = `
          <div style="
            background: ${colors.bgSecondary};
            border: 1px solid ${colors.border};
            border-radius: 12px;
            padding: 16px;
            color: ${colors.danger};
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          ">
            Unable to load credits: ${error}
          </div>
        `;
        return;
      }

      // Loaded state
      const d = this.data;
      const trendIcon = d.trend === 'up' ? '↑' : '↓';
      const trendColor = d.trend === 'up' ? colors.warning : colors.success;

      this.container.innerHTML = `
        <div style="
          background: ${colors.bgSecondary};
          border: 1px solid ${colors.border};
          border-radius: 12px;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: ${colors.text};
        ">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: ${colors.text};">
              Credits Used
            </h3>
            <div style="font-size: 12px; color: ${colors.textSecondary};">
              This month
            </div>
          </div>

          <!-- Credits Bar -->
          <div style="margin-bottom: 12px;">
            <div style="
              background: ${colors.border};
              border-radius: 4px;
              height: 8px;
              overflow: hidden;
              margin-bottom: 6px;
            ">
              <div style="
                background: linear-gradient(90deg, ${colors.primary}, ${colors.primary}dd);
                height: 100%;
                width: ${d.creditsPercent}%;
                transition: width 0.3s ease;
              "></div>
            </div>
            <div style="
              display: flex;
              justify-content: space-between;
              font-size: 12px;
              color: ${colors.textSecondary};
            ">
              <span>${d.creditsUsed.toLocaleString()} / ${d.creditsTotal.toLocaleString()}</span>
              <span>${d.creditsPercent.toFixed(1)}%</span>
            </div>
          </div>

          <!-- Spend and Trend -->
          <div style="
            background: ${colors.bg};
            border: 1px solid ${colors.border};
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <div>
              <div style="font-size: 12px; color: ${colors.textSecondary}; margin-bottom: 4px;">
                Monthly Spend
              </div>
              <div style="font-size: 18px; font-weight: 700; color: ${colors.primary};">
                $${d.monthlySpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style="
              background: ${trendColor}20;
              color: ${trendColor};
              padding: 6px 10px;
              border-radius: 6px;
              font-size: 13px;
              font-weight: 600;
              text-align: center;
            ">
              <div style="font-size: 16px; margin-bottom: 2px;">${trendIcon}</div>
              <div>${d.trendPercent.toFixed(1)}%</div>
            </div>
          </div>

          <!-- Most Expensive -->
          <div style="
            background: ${colors.bg};
            border: 1px solid ${colors.border};
            border-radius: 8px;
            padding: 12px;
            font-size: 12px;
          ">
            <div style="color: ${colors.textSecondary}; margin-bottom: 6px;">
              Most Expensive Model
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: ${colors.text};">
                  ${d.mostExpensive.model}
                </div>
                <div style="color: ${colors.textSecondary}; font-size: 11px; margin-top: 2px;">
                  ${d.mostExpensive.percent}% of total
                </div>
              </div>
              <div style="
                font-weight: 700;
                font-size: 14px;
                color: ${colors.primary};
              ">
                $${d.mostExpensive.cost.toFixed(2)}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid ${colors.border};
            font-size: 11px;
            color: ${colors.textSecondary};
            text-align: center;
          ">
            Powered by <strong>Finault</strong>
          </div>
        </div>
      `;
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

  // Expose global reference
  window.FinaultCostWidget = { version: '1.0.0' };
})();
