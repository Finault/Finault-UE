/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT POWER FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Criticism #18: "No keyboard shortcuts" → Command Palette (Cmd+K)
 * Criticism #19: "Mobile is broken" → Responsive Design
 * Criticism #20: "No sharing. No virality." → Sharing Features
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICISM #18: COMMAND PALETTE (Cmd+K)
// "Power users want to fly. Upload invoice? Cmd+U. Generate close pack? Cmd+G."
// ═══════════════════════════════════════════════════════════════════════════════

const COMMANDS = [
  // Navigation
  { id: 'nav-dashboard', label: 'Go to Dashboard', shortcut: 'G D', category: 'Navigation', action: () => window.location.href = '/dashboard' },
  { id: 'nav-invoices', label: 'Go to Invoices', shortcut: 'G I', category: 'Navigation', action: () => window.location.href = '/invoices' },
  { id: 'nav-analytics', label: 'Go to Analytics', shortcut: 'G A', category: 'Navigation', action: () => window.location.href = '/analytics' },
  { id: 'nav-settings', label: 'Go to Settings', shortcut: 'G S', category: 'Navigation', action: () => window.location.href = '/settings' },
  { id: 'nav-budgets', label: 'Go to Budgets', shortcut: 'G B', category: 'Navigation', action: () => window.location.href = '/budgets' },

  // Actions
  { id: 'upload-invoice', label: 'Upload Invoice', shortcut: 'Cmd+U', category: 'Actions', action: () => document.querySelector('[data-upload-trigger]')?.click() },
  { id: 'generate-closepack', label: 'Generate Close Pack', shortcut: 'Cmd+G', category: 'Actions', action: () => window.location.href = '/close-pack/generate' },
  { id: 'export-csv', label: 'Export to CSV', shortcut: 'Cmd+E', category: 'Actions', action: 'exportCSV' },
  { id: 'export-pdf', label: 'Export to PDF', shortcut: 'Cmd+Shift+E', category: 'Actions', action: 'exportPDF' },
  { id: 'new-budget', label: 'Create New Budget', shortcut: 'Cmd+B', category: 'Actions', action: () => window.location.href = '/budgets/new' },
  { id: 'new-rule', label: 'Create Allocation Rule', shortcut: 'Cmd+R', category: 'Actions', action: () => window.location.href = '/rules/new' },

  // Quick Actions
  { id: 'refresh', label: 'Refresh Data', shortcut: 'Cmd+Shift+R', category: 'Quick Actions', action: () => window.location.reload() },
  { id: 'toggle-theme', label: 'Toggle Dark Mode', shortcut: 'Cmd+Shift+D', category: 'Quick Actions', action: 'toggleTheme' },
  { id: 'help', label: 'Open Help', shortcut: '?', category: 'Quick Actions', action: () => window.open('https://docs.finault.ai', '_blank') },

  // Search
  { id: 'search-invoices', label: 'Search Invoices...', shortcut: '/', category: 'Search', action: 'focusSearch' },
  { id: 'search-models', label: 'Search by Model...', category: 'Search', action: 'searchModels' },
  { id: 'search-cost-center', label: 'Search by Cost Center...', category: 'Search', action: 'searchCostCenter' },
];

export function CommandPalette({ isOpen, onClose, onAction }) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filteredCommands = COMMANDS.filter(cmd =>
    cmd.label.toLowerCase().includes(search.toLowerCase()) ||
    cmd.category.toLowerCase().includes(search.toLowerCase())
  );

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) {
        // Open with Cmd+K or Ctrl+K
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          onAction?.('open');
        }
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) executeCommand(cmd);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex]);

  const executeCommand = (cmd) => {
    onClose();
    if (typeof cmd.action === 'function') {
      cmd.action();
    } else if (typeof cmd.action === 'string') {
      onAction?.(cmd.action, cmd);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-palette-header">
          <svg className="command-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIndex(0); }}
            className="command-input"
          />
          <kbd className="command-kbd">ESC</kbd>
        </div>

        <div className="command-list" ref={listRef}>
          {Object.entries(groupedCommands).map(([category, commands]) => (
            <div key={category} className="command-group">
              <div className="command-group-label">{category}</div>
              {commands.map((cmd, i) => {
                const globalIndex = filteredCommands.indexOf(cmd);
                return (
                  <button
                    key={cmd.id}
                    className={`command-item ${globalIndex === selectedIndex ? 'selected' : ''}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                  >
                    <span className="command-label">{cmd.label}</span>
                    {cmd.shortcut && <kbd className="command-shortcut">{cmd.shortcut}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
          {filteredCommands.length === 0 && (
            <div className="command-empty">No commands found</div>
          )}
        </div>

        <div className="command-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>

      <style>{`
        .command-palette-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 15vh;
          z-index: 9999;
          backdrop-filter: blur(4px);
        }

        .command-palette {
          width: 100%;
          max-width: 640px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          overflow: hidden;
        }

        @media (prefers-color-scheme: dark) {
          .command-palette {
            background: #1a1a1a;
            color: white;
          }
        }

        .command-palette-header {
          display: flex;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
          gap: 12px;
        }

        .command-icon {
          width: 20px;
          height: 20px;
          color: #9ca3af;
        }

        .command-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 16px;
          background: transparent;
        }

        .command-kbd {
          padding: 4px 8px;
          background: #f3f4f6;
          border-radius: 4px;
          font-size: 12px;
          font-family: monospace;
          color: #6b7280;
        }

        .command-list {
          max-height: 400px;
          overflow-y: auto;
          padding: 8px;
        }

        .command-group {
          margin-bottom: 8px;
        }

        .command-group-label {
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #9ca3af;
          text-transform: uppercase;
        }

        .command-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 10px 12px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          font-size: 14px;
        }

        .command-item:hover, .command-item.selected {
          background: #f3f4f6;
        }

        .command-shortcut {
          padding: 2px 6px;
          background: #e5e7eb;
          border-radius: 4px;
          font-size: 11px;
          font-family: monospace;
        }

        .command-empty {
          padding: 24px;
          text-align: center;
          color: #9ca3af;
        }

        .command-footer {
          display: flex;
          gap: 16px;
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #9ca3af;
        }

        .command-footer kbd {
          padding: 2px 4px;
          background: #f3f4f6;
          border-radius: 3px;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICISM #19: MOBILE RESPONSIVE DESIGN
// "CFO opens dashboard on their phone during a board meeting... fails."
// ═══════════════════════════════════════════════════════════════════════════════

export function ResponsiveLayout({ children, sidebar }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="responsive-layout">
      {/* Mobile header */}
      {isMobile && (
        <header className="mobile-header">
          <button className="hamburger" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18"/>
            </svg>
          </button>
          <div className="mobile-logo">
            <span className="logo-text">Finault</span>
          </div>
          <button className="mobile-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </header>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isMobile ? 'mobile' : ''}`}>
        {isMobile && (
          <div className="sidebar-header">
            <span className="logo-text">Finault</span>
            <button className="close-sidebar" onClick={() => setIsSidebarOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}
        {sidebar}
      </aside>

      {/* Overlay for mobile sidebar */}
      {isMobile && isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="main-content">
        {children}
      </main>

      <style>{`
        .responsive-layout {
          display: flex;
          min-height: 100vh;
        }

        .mobile-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 56px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          z-index: 100;
        }

        .hamburger, .mobile-action, .close-sidebar {
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
        }

        .hamburger svg, .mobile-action svg, .close-sidebar svg {
          width: 24px;
          height: 24px;
        }

        .mobile-logo {
          font-size: 20px;
          font-weight: 700;
        }

        .sidebar {
          width: 256px;
          background: #f9fafb;
          border-right: 1px solid #e5e7eb;
          padding: 16px;
          flex-shrink: 0;
        }

        .sidebar.mobile {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 200;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          background: white;
        }

        .sidebar.mobile.open {
          transform: translateX(0);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          margin-bottom: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .sidebar-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 150;
        }

        .main-content {
          flex: 1;
          padding: 24px;
          overflow-x: hidden;
        }

        @media (max-width: 768px) {
          .sidebar:not(.mobile) {
            display: none;
          }

          .main-content {
            padding: 72px 16px 16px;
          }
        }

        /* Touch-friendly tooltips */
        @media (max-width: 768px) {
          .tooltip {
            display: none !important;
          }
        }

        /* Larger touch targets */
        @media (max-width: 768px) {
          button, a, input, select {
            min-height: 44px;
            min-width: 44px;
          }
        }
      `}</style>
    </div>
  );
}

// Mobile-optimized metric card
export function MobileMetricCard({ title, value, change, trend }) {
  return (
    <div className="mobile-metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      {change && (
        <div className={`metric-change ${trend}`}>
          {trend === 'up' ? '↑' : '↓'} {change}
        </div>
      )}

      <style>{`
        .mobile-metric-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .metric-title {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
        }

        .metric-value {
          font-size: 24px;
          font-weight: 700;
        }

        .metric-change {
          font-size: 12px;
          margin-top: 4px;
        }

        .metric-change.up {
          color: #10b981;
        }

        .metric-change.down {
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICISM #20: SHARING & VIRALITY
// "User generates brilliant close pack. Wants to share insight with their CFO
//  friend at another company. No share button. You're not growing."
// ═══════════════════════════════════════════════════════════════════════════════

export function ShareModal({ isOpen, onClose, data, type }) {
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [obfuscate, setObfuscate] = useState(true);

  useEffect(() => {
    if (isOpen && data) {
      // Generate share URL
      const params = new URLSearchParams({
        type,
        id: data.id,
        obfuscate: obfuscate.toString()
      });
      setShareUrl(`https://app.finault.ai/shared?${params}`);
    }
  }, [isOpen, data, obfuscate, type]);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareToLinkedIn = () => {
    const text = generateLinkedInPost(data);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareToTwitter = () => {
    const text = generateTwitterPost(data);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const inviteColleague = () => {
    window.location.href = `/invite?ref=${data.id}`;
  };

  if (!isOpen) return null;

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <div className="share-header">
          <h2>Share This Report</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="share-content">
          {/* Privacy toggle */}
          <div className="share-option">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={obfuscate}
                onChange={e => setObfuscate(e.target.checked)}
              />
              <span className="toggle-text">
                Obfuscate sensitive data
                <small>Hides exact amounts and company-specific information</small>
              </span>
            </label>
          </div>

          {/* Share link */}
          <div className="share-link-box">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="share-link-input"
            />
            <button className="copy-btn" onClick={copyToClipboard}>
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>

          {/* Social sharing */}
          <div className="share-social">
            <button className="social-btn linkedin" onClick={shareToLinkedIn}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
              Share on LinkedIn
            </button>
            <button className="social-btn twitter" onClick={shareToTwitter}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/>
              </svg>
              Share on Twitter
            </button>
          </div>

          {/* Invite colleague */}
          <div className="invite-section">
            <h3>Invite a Colleague</h3>
            <p>They get $50 credit, you get $50 when they upgrade.</p>
            <button className="invite-btn" onClick={inviteColleague}>
              Send Invitation
            </button>
          </div>
        </div>

        <style>{`
          .share-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
          }

          .share-modal {
            background: white;
            border-radius: 16px;
            width: 100%;
            max-width: 480px;
            overflow: hidden;
          }

          .share-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
          }

          .share-header h2 {
            margin: 0;
            font-size: 18px;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #9ca3af;
          }

          .share-content {
            padding: 24px;
          }

          .share-option {
            margin-bottom: 20px;
          }

          .toggle-label {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            cursor: pointer;
          }

          .toggle-text {
            display: flex;
            flex-direction: column;
          }

          .toggle-text small {
            color: #6b7280;
            margin-top: 2px;
          }

          .share-link-box {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
          }

          .share-link-input {
            flex: 1;
            padding: 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
          }

          .copy-btn {
            padding: 12px 20px;
            background: #000;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
          }

          .share-social {
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
          }

          .social-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
          }

          .social-btn svg {
            width: 20px;
            height: 20px;
          }

          .social-btn.linkedin {
            background: #0077b5;
            color: white;
          }

          .social-btn.twitter {
            background: #1da1f2;
            color: white;
          }

          .invite-section {
            background: #f9fafb;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
          }

          .invite-section h3 {
            margin: 0 0 8px;
          }

          .invite-section p {
            color: #6b7280;
            margin: 0 0 16px;
          }

          .invite-btn {
            background: linear-gradient(135deg, #00D84A 0%, #00b33c 100%);
            color: white;
            border: none;
            padding: 12px 32px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
          }
        `}</style>
      </div>
    </div>
  );
}

function generateLinkedInPost(data) {
  return `We just achieved ${data.savings || '23%'} reduction in AI costs using @Finault!

Key insights:
• Identified model optimization opportunities
• Automated cost allocation
• Real-time spend visibility

#AIGovernance #CostOptimization #CFO`;
}

function generateTwitterPost(data) {
  return `Just reduced our AI costs by ${data.savings || '23%'} with @FinaultAI 🚀

The dashboard that shows dollars, not data. Every CFO needs this.`;
}

// Referral tracking component
export function ReferralBanner({ referralCode, referralCount, earnings }) {
  const copyCode = () => {
    navigator.clipboard.writeText(`https://finault.ai/signup?ref=${referralCode}`);
  };

  return (
    <div className="referral-banner">
      <div className="referral-stats">
        <div className="stat">
          <div className="stat-value">{referralCount}</div>
          <div className="stat-label">Referrals</div>
        </div>
        <div className="stat">
          <div className="stat-value">${earnings}</div>
          <div className="stat-label">Earned</div>
        </div>
      </div>
      <div className="referral-code">
        <span>Your referral link</span>
        <code>finault.ai/r/{referralCode}</code>
        <button onClick={copyCode}>Copy</button>
      </div>

      <style>{`
        .referral-banner {
          background: linear-gradient(135deg, #000 0%, #1a1a1a 100%);
          color: white;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .referral-stats {
          display: flex;
          gap: 32px;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
        }

        .stat-label {
          font-size: 12px;
          color: #9ca3af;
        }

        .referral-code {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .referral-code code {
          background: rgba(255,255,255,0.1);
          padding: 8px 12px;
          border-radius: 6px;
        }

        .referral-code button {
          background: #00D84A;
          color: black;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default {
  CommandPalette,
  ResponsiveLayout,
  MobileMetricCard,
  ShareModal,
  ReferralBanner
};
