/**
 * Finault Confidence Badges Web Component
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * <finault-confidence tier="1" confidence="100" method="sdk-tagged"></finault-confidence>
 *
 * Attributes:
 * - tier: 1 (green), 2 (yellow), 3 (gray)
 * - confidence: 0-100 percentage
 * - method: attribution method name
 *
 * Tiers:
 * - Tier 1 (SDK-tagged): Green checkmark, 100% confidence
 * - Tier 2 (Pattern-matched): Yellow dot, 85-95% confidence
 * - Tier 3 (Proportional estimate): Gray dot, < 85% confidence
 */

class FinaultConfidence extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    // Add tooltip on hover
    this.shadowRoot.addEventListener('mouseenter', (e) => this.showTooltip(e));
    this.shadowRoot.addEventListener('mouseleave', () => this.hideTooltip());
  }

  get tier() {
    return parseInt(this.getAttribute('tier') || 1);
  }

  get confidence() {
    return parseInt(this.getAttribute('confidence') || 100);
  }

  get method() {
    return this.getAttribute('method') || 'unknown';
  }

  getTierInfo() {
    const tiers = {
      1: {
        color: '#10b981',
        label: 'Tier 1: SDK-Tagged',
        icon: '✓',
        description: 'Manually mapped via Stripe SDK integration. Highest confidence.'
      },
      2: {
        color: '#f59e0b',
        label: 'Tier 2: Pattern-Matched',
        icon: '●',
        description: 'Automatically matched using learned attribution patterns.'
      },
      3: {
        color: '#9ca3af',
        label: 'Tier 3: Estimated',
        icon: '●',
        description: 'Proportional estimate based on historical data.'
      }
    };
    return tiers[this.tier] || tiers[3];
  }

  getMethodDescription() {
    const methods = {
      'sdk-tagged': 'Customer explicitly mapped via SDK integration',
      'pattern-matched': `Matched using ${this.method} pattern with ${this.confidence}% confidence`,
      'proportional-estimate': `Allocated proportionally based on historical usage (${this.confidence}% confidence)`,
      'manual-override': 'Manually mapped by organization admin'
    };
    return methods[this.method] || `Matched via ${this.method}`;
  }

  render() {
    const tierInfo = this.getTierInfo();
    const confidenceLabel = this.confidence === 100 ? 'Verified' : `${this.confidence}%`;

    const styles = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: system-ui, -apple-system, sans-serif;
          cursor: help;
          user-select: none;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: ${tierInfo.color};
          color: white;
          font-weight: bold;
          font-size: 14px;
          line-height: 1;
        }

        .label {
          font-size: 13px;
          font-weight: 500;
          color: #374151;
        }

        .confidence {
          font-size: 12px;
          color: #6b7280;
          font-weight: normal;
        }

        .tooltip {
          position: absolute;
          z-index: 10000;
          background: #1f2937;
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.4;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
        }

        .tooltip.visible {
          opacity: 1;
        }

        .tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 4px solid transparent;
          border-top-color: #1f2937;
        }
      </style>
    `;

    const content = `
      <div class="badge">${tierInfo.icon}</div>
      <div>
        <div class="label">${tierInfo.label}</div>
        <div class="confidence">${confidenceLabel}</div>
      </div>
      <div class="tooltip" role="tooltip">
        <strong>${this.getTierInfo().description}</strong><br>
        ${this.getMethodDescription()}
      </div>
    `;

    this.shadowRoot.innerHTML = styles + content;
  }

  showTooltip(e) {
    const tooltip = this.shadowRoot.querySelector('.tooltip');
    if (tooltip) {
      tooltip.classList.add('visible');
    }
  }

  hideTooltip() {
    const tooltip = this.shadowRoot.querySelector('.tooltip');
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  }

  // Allow updating attributes dynamically
  static get observedAttributes() {
    return ['tier', 'confidence', 'method'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }
}

// Register the custom element
if (!customElements.get('finault-confidence')) {
  customElements.define('finault-confidence', FinaultConfidence);
}

/**
 * Utility: Create and insert confidence badge into DOM
 * @param {HTMLElement} container - Parent element
 * @param {number} tier - Confidence tier
 * @param {number} confidence - Confidence percentage
 * @param {string} method - Attribution method
 */
export function createConfidenceBadge(container, tier = 1, confidence = 100, method = 'sdk-tagged') {
  const badge = document.createElement('finault-confidence');
  badge.setAttribute('tier', String(tier));
  badge.setAttribute('confidence', String(confidence));
  badge.setAttribute('method', method);
  container.appendChild(badge);
  return badge;
}

/**
 * Utility: Get CSS classes for styling based on tier
 * @param {number} tier - Confidence tier
 * @returns {string} CSS classes
 */
export function getConfidenceClasses(tier) {
  const classes = {
    1: 'bg-green-100 text-green-800 border-green-300',
    2: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    3: 'bg-gray-100 text-gray-800 border-gray-300'
  };
  return classes[tier] || classes[3];
}

/**
 * Utility: Determine tier from confidence percentage
 * @param {number} confidence - Confidence percentage
 * @returns {number} Tier 1, 2, or 3
 */
export function getTierFromConfidence(confidence) {
  if (confidence >= 99) return 1;
  if (confidence >= 85) return 2;
  return 3;
}

export { FinaultConfidence };
