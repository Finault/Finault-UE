'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Building,
  Bell,
  Shield,
  Database,
  Palette,
} from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { api } from '@/lib/api';

interface SettingsState {
  organizationName: string;
  slug: string;
  defaultCurrency: string;
  fiscalYearStart: string;
  emailAlerts: boolean;
  slackNotifications: boolean;
  budgetWarnings: boolean;
  anomalyAlerts: boolean;
  ssoProvider: string;
  twoFactorEnforcement: boolean;
  sessionTimeout: string;
  connectedERPs: string[];
  exportFormat: string;
  dataRetention: string;
  theme: 'dark' | 'light';
  compactMode: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

// MEDIUM/LOW: Color constants to avoid hardcoded values
const COLORS = {
  PRIMARY: 'hsl(142 76% 36%)',
  PRIMARY_LIGHT: 'hsl(142 76% 45%)',
  TEXT_MUTED: '#374151',
  ERROR: '#dc2626',
};

/**
 * SettingsPage Component
 * Manages organization settings, notifications, security, and appearance configurations.
 * Includes input validation and error boundary handling.
 */
export default function SettingsPage() {
  const { user } = useFinaultStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [lastSaved, setLastSaved] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [settings, setSettings] = useState<SettingsState>({
    organizationName: 'Acme Corporation',
    slug: 'acme-corp',
    defaultCurrency: 'USD',
    fiscalYearStart: 'January',
    emailAlerts: true,
    slackNotifications: true,
    budgetWarnings: true,
    anomalyAlerts: false,
    ssoProvider: 'Okta',
    twoFactorEnforcement: true,
    sessionTimeout: '30',
    connectedERPs: ['SAP', 'NetSuite'],
    exportFormat: 'CSV',
    dataRetention: '90',
    theme: 'dark',
    compactMode: false,
  });

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const result = await api.getSettings();
      if (result.success && result.settings) {
        setSettings((prev) => ({
          ...prev,
          organizationName:
            result.settings.organizationName ||
            result.settings.organization_name ||
            prev.organizationName,
          slug: result.settings.slug || prev.slug,
          defaultCurrency:
            result.settings.defaultCurrency ||
            result.settings.default_currency ||
            prev.defaultCurrency,
          fiscalYearStart:
            result.settings.fiscalYearStart ||
            result.settings.fiscal_year_start ||
            prev.fiscalYearStart,
          emailAlerts:
            result.settings.emailAlerts !== undefined
              ? result.settings.emailAlerts
              : prev.emailAlerts,
          slackNotifications:
            result.settings.slackNotifications !== undefined
              ? result.settings.slackNotifications
              : prev.slackNotifications,
          budgetWarnings:
            result.settings.budgetWarnings !== undefined
              ? result.settings.budgetWarnings
              : prev.budgetWarnings,
          anomalyAlerts:
            result.settings.anomalyAlerts !== undefined
              ? result.settings.anomalyAlerts
              : prev.anomalyAlerts,
          ssoProvider:
            result.settings.ssoProvider ||
            result.settings.sso_provider ||
            prev.ssoProvider,
          twoFactorEnforcement:
            result.settings.twoFactorEnforcement !== undefined
              ? result.settings.twoFactorEnforcement
              : prev.twoFactorEnforcement,
          sessionTimeout:
            result.settings.sessionTimeout ||
            result.settings.session_timeout ||
            prev.sessionTimeout,
          connectedERPs:
            result.settings.connectedERPs ||
            result.settings.connected_erps ||
            prev.connectedERPs,
          exportFormat:
            result.settings.exportFormat ||
            result.settings.export_format ||
            prev.exportFormat,
          dataRetention:
            result.settings.dataRetention ||
            result.settings.data_retention ||
            prev.dataRetention,
          theme:
            (result.settings.theme as 'dark' | 'light') || prev.theme,
          compactMode:
            result.settings.compactMode !== undefined
              ? result.settings.compactMode
              : prev.compactMode,
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Keep default settings as fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const validateInput = (field: string, value: string): string | null => {
    switch (field) {
      case 'organizationName':
        if (value.length < 2) return 'Organization name must be at least 2 characters';
        if (value.length > 100) return 'Organization name must be at most 100 characters';
        return null;
      case 'slug':
        if (!/^[a-z0-9-]*$/.test(value)) return 'Slug can only contain lowercase letters, numbers, and hyphens';
        if (value.length > 50) return 'Slug must be at most 50 characters';
        return null;
      default:
        return null;
    }
  };

  const handleInputChange = (
    field: keyof SettingsState,
    value: string | boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Validate on change
    if (typeof value === 'string') {
      const error = validateInput(field, value);
      if (error) {
        setValidationErrors((prev) => ({ ...prev, [field]: error }));
      } else {
        setValidationErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
    }
  };

  const handleInputBlur = (field: string, value: string) => {
    const error = validateInput(field, value);
    if (error) {
      setValidationErrors((prev) => ({ ...prev, [field]: error }));
    }
  };

  const handleSaveChanges = async () => {
    // Validate before saving
    const errors: Record<string, string> = {};
    if (settings.organizationName.length < 2 || settings.organizationName.length > 100) {
      errors.organizationName = 'Organization name must be between 2 and 100 characters';
    }
    if (!/^[a-z0-9-]*$/.test(settings.slug) || settings.slug.length > 50) {
      errors.slug = 'Slug must be valid: lowercase letters, numbers, hyphens, max 50 chars';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      await api.updateSettings(settings);
      setSavedMessage('Settings saved successfully!');
      setLastSaved(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSavedMessage('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSavedMessage(''), 3000);
    }
  };

  /**
   * ToggleSwitch Component
   * Accessible toggle switch for boolean settings.
   * MEDIUM: Added aria-label and role attributes for accessibility.
   */
  const ToggleSwitch = ({
    id,
    checked,
    onChange,
  }: {
    id: string;
    checked: boolean;
    onChange: (value: boolean) => void;
  }) => (
    <button
      type="button"
      id={id}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked
          ? 'bg-green-600'
          : 'bg-gray-700'
      }`}
      style={{
        backgroundColor: checked ? COLORS.PRIMARY : COLORS.TEXT_MUTED,
      }}
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle setting: ${id}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Settings" subtitle="Configure your workspace" />

        <main className="flex-1 overflow-auto">
          <div className="p-8">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: COLORS.PRIMARY }}
                >
                  <Settings className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <h1 className="text-3xl font-bold">Settings</h1>
              </div>
              <p className="text-gray-500">Configure your workspace</p>
            </motion.div>

            {/* Loading State */}
            {isLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <span className="animate-spin">⟳</span>
                  <p className="text-blue-700 font-medium">
                    Loading your settings...
                  </p>
                </div>
              </div>
            )}

            {/* Settings Sections */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-6 max-w-4xl"
            >
              {/* Organization Settings */}
              <motion.div
                variants={itemVariants}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Building className="w-5 h-5" style={{ color: COLORS.PRIMARY }} aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Organization Settings</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Organization Name
                    </label>
                    <input
                      type="text"
                      value={settings.organizationName}
                      onChange={(e) =>
                        handleInputChange('organizationName', e.target.value)
                      }
                      onBlur={(e) =>
                        handleInputBlur('organizationName', e.target.value)
                      }
                      className={`input w-full bg-gray-100 border rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none transition-colors ${
                        validationErrors.organizationName ? `border-red-500 focus:border-red-600` : 'border-gray-200 focus:border-green-600'
                      }`}
                      style={{
                        '--focus-color': COLORS.PRIMARY,
                      } as React.CSSProperties}
                      aria-invalid={!!validationErrors.organizationName}
                      aria-describedby={validationErrors.organizationName ? 'org-error' : undefined}
                    />
                    {validationErrors.organizationName && (
                      <p className="text-red-500 text-sm mt-1" id="org-error" role="alert">{validationErrors.organizationName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Workspace Slug
                    </label>
                    <input
                      type="text"
                      value={settings.slug}
                      onChange={(e) =>
                        handleInputChange('slug', e.target.value)
                      }
                      onBlur={(e) =>
                        handleInputBlur('slug', e.target.value)
                      }
                      className={`input w-full bg-gray-100 border rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none transition-colors ${
                        validationErrors.slug ? 'border-red-500 focus:border-red-600' : 'border-gray-200 focus:border-green-600'
                      }`}
                      aria-invalid={!!validationErrors.slug}
                      aria-describedby={validationErrors.slug ? 'slug-error' : undefined}
                    />
                    {validationErrors.slug && (
                      <p className="text-red-500 text-sm mt-1" id="slug-error" role="alert">{validationErrors.slug}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Alphanumeric and hyphens only, max 50 characters</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        Default Currency
                      </label>
                      <select
                        value={settings.defaultCurrency}
                        onChange={(e) =>
                          handleInputChange('defaultCurrency', e.target.value)
                        }
                        className="input w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
                      >
                        <option>USD</option>
                        <option>EUR</option>
                        <option>GBP</option>
                        <option>JPY</option>
                        <option>CAD</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        Fiscal Year Starts
                      </label>
                      <select
                        value={settings.fiscalYearStart}
                        onChange={(e) =>
                          handleInputChange('fiscalYearStart', e.target.value)
                        }
                        className="input w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
                      >
                        <option>January</option>
                        <option>February</option>
                        <option>March</option>
                        <option>April</option>
                        <option>July</option>
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Notifications */}
              <motion.div
                variants={itemVariants}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Bell className="w-5 h-5" style={{ color: COLORS.PRIMARY }} aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Notifications</h2>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Email Alerts', key: 'emailAlerts' },
                    { label: 'Slack Notifications', key: 'slackNotifications' },
                    { label: 'Budget Warnings', key: 'budgetWarnings' },
                    { label: 'Anomaly Alerts', key: 'anomalyAlerts' },
                  ].map(({ label, key }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-gray-600">{label}</span>
                      <ToggleSwitch
                        id={key}
                        checked={settings[key as keyof SettingsState] as boolean}
                        onChange={(value) =>
                          handleInputChange(key as keyof SettingsState, value)
                        }
                      />
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Security */}
              <motion.div
                variants={itemVariants}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Shield className="w-5 h-5" style={{ color: COLORS.PRIMARY }} aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Security</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Single Sign-On (SSO)
                    </label>
                    <div className="flex gap-2">
                      {['Okta', 'Azure AD', 'Disabled'].map((option) => (
                        <button
                          key={option}
                          onClick={() =>
                            handleInputChange('ssoProvider', option)
                          }
                          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                            settings.ssoProvider === option
                              ? 'text-white'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                          style={{
                            backgroundColor:
                              settings.ssoProvider === option
                                ? COLORS.PRIMARY
                                : 'transparent',
                            border:
                              settings.ssoProvider === option
                                ? 'none'
                                : '1px solid #d1d5db',
                          }}
                          aria-pressed={settings.ssoProvider === option}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Current SSO Provider: {settings.ssoProvider}
                    </p>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-600">
                      Enforce Two-Factor Authentication
                    </span>
                    <ToggleSwitch
                      id="2fa"
                      checked={settings.twoFactorEnforcement}
                      onChange={(value) =>
                        handleInputChange('twoFactorEnforcement', value)
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Session Timeout (minutes)
                    </label>
                    <select
                      value={settings.sessionTimeout}
                      onChange={(e) =>
                        handleInputChange('sessionTimeout', e.target.value)
                      }
                      className="input w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
                    >
                      <option>15</option>
                      <option>30</option>
                      <option>60</option>
                      <option>120</option>
                    </select>
                  </div>
                </div>
              </motion.div>

              {/* Data & Integration */}
              <motion.div
                variants={itemVariants}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Database className="w-5 h-5" style={{ color: COLORS.PRIMARY }} aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Data & Integration</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Connected ERP Systems
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {settings.connectedERPs.map((erp) => (
                        <span
                          key={erp}
                          className="px-3 py-1 rounded-full text-sm font-medium text-white"
                          style={{ backgroundColor: COLORS.PRIMARY }}
                        >
                          {erp}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Add integrations in the Integrations section
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Export Format
                    </label>
                    <select
                      value={settings.exportFormat}
                      onChange={(e) =>
                        handleInputChange('exportFormat', e.target.value)
                      }
                      className="input w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
                    >
                      <option>CSV</option>
                      <option>JSON</option>
                      <option>Excel</option>
                      <option>Parquet</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Data Retention (days)
                    </label>
                    <select
                      value={settings.dataRetention}
                      onChange={(e) =>
                        handleInputChange('dataRetention', e.target.value)
                      }
                      className="input w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
                    >
                      <option>30</option>
                      <option>90</option>
                      <option>180</option>
                      <option>365</option>
                      <option>Indefinite</option>
                    </select>
                  </div>
                </div>
              </motion.div>

              {/* Appearance */}
              <motion.div
                variants={itemVariants}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Palette className="w-5 h-5" style={{ color: COLORS.PRIMARY }} aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Appearance</h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-gray-600">Theme</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Currently: {settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {['dark', 'light'].map((theme) => (
                        <button
                          key={theme}
                          onClick={() =>
                            handleInputChange(
                              'theme',
                              theme as 'dark' | 'light'
                            )
                          }
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            settings.theme === theme
                              ? 'text-white'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                          style={{
                            backgroundColor:
                              settings.theme === theme
                                ? COLORS.PRIMARY
                                : 'transparent',
                            border:
                              settings.theme === theme
                                ? 'none'
                                : '1px solid #d1d5db',
                          }}
                          aria-pressed={settings.theme === theme}
                        >
                          {theme === 'dark' ? '🌙' : '☀️'} {theme}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-gray-600">Compact Mode</span>
                      <p className="text-xs text-gray-500 mt-1">
                        Reduce padding and spacing
                      </p>
                    </div>
                    <ToggleSwitch
                      id="compact"
                      checked={settings.compactMode}
                      onChange={(value) =>
                        handleInputChange('compactMode', value)
                      }
                    />
                  </div>
                </div>
              </motion.div>

              {/* Save Button and Message */}
              <motion.div
                variants={itemVariants}
                className="flex flex-col gap-4 pt-4"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSaveChanges}
                    disabled={isSaving || Object.keys(validationErrors).length > 0}
                    className="px-6 py-2 rounded font-semibold text-white transition-all disabled:opacity-70"
                    style={{
                      backgroundColor: COLORS.PRIMARY,
                    }}
                    aria-busy={isSaving}
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⟳</span>
                        Saving...
                      </span>
                    ) : (
                      'Save Changes'
                    )}
                  </button>

                  {savedMessage && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={`text-sm font-medium ${savedMessage.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}
                    >
                      {savedMessage.includes('Failed') ? '✗' : '✓'} {savedMessage}
                    </motion.div>
                  )}
                </div>

                {lastSaved && (
                  <p className="text-xs text-gray-500">
                    Last saved: {lastSaved}
                  </p>
                )}

                {Object.keys(validationErrors).length > 0 && (
                  <p className="text-sm text-red-500 font-medium">
                    Please fix validation errors before saving
                  </p>
                )}
              </motion.div>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}
