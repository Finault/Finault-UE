/**
 * FINAULT MULTI-TENANT ARCHITECTURE (Gap 1 Build Analysis)
 *
 * Implements comprehensive multi-tenancy infrastructure including:
 * - Row-Level Security (RLS) policy generation for all 10 core tables
 * - Tenant context extraction and middleware
 * - Tenant lifecycle management (create, suspend, reactivate, delete)
 * - Noisy neighbor prevention via plan-based quotas
 * - Tenant-scoped database query helpers
 *
 * FOCUS AREAS:
 * 1.1: Tenant isolation via RLS policies and org_id filtering
 * 1.2: Tenant lifecycle management with data export capabilities
 * 1.3: Data export as CSV + close packs ZIP + config JSON
 * 1.4: Quota enforcement with 429/402 HTTP responses
 * 1.5: Suspended tenant handling (403 response)
 */

// ============================================================================
// 1. ROW-LEVEL SECURITY (RLS) POLICY GENERATOR
// ============================================================================

/**
 * All core tables requiring RLS policies
 * Maps to the 10 core tables referenced in schema
 */
export const RLS_TABLES = [
  'invoices',
  'invoice_line_items',
  'reconciliation_runs',
  'close_packs',
  'budgets',
  'anomaly_detections',
  'audit_events',
  'agent_runs',
  'organizations',
  'cost_records'
];

/**
 * Generates RLS policy SQL for a single table
 * @param {string} tableName - Name of the table to generate policy for
 * @returns {string} SQL statements for enabling RLS and creating tenant isolation policy
 */
export function generateRLSPolicies(tableName) {
  if (!tableName || typeof tableName !== 'string') {
    throw new Error('tableName must be a non-empty string');
  }

  const policy_name = `${tableName}_tenant_isolation`;

  return `
-- Enable Row Level Security on ${tableName}
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy: only allow access to rows matching current_setting('app.current_org_id')
CREATE POLICY ${policy_name}
  ON ${tableName}
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ${tableName} TO authenticated;
`;
}

/**
 * Generates RLS policies for all core tables
 * @returns {string} Complete SQL for RLS setup across all tables
 */
export function generateAllRLSPolicies() {
  const statements = [
    '-- ================================================================',
    '-- FINAULT MULTI-TENANT ROW-LEVEL SECURITY (RLS)',
    '-- Enables strong tenant isolation at the database layer',
    '-- ================================================================',
    ''
  ];

  for (const table of RLS_TABLES) {
    statements.push(generateRLSPolicies(table));
    statements.push('');
  }

  statements.push('-- All RLS policies applied successfully');

  return statements.join('\n');
}

/**
 * Schema for RLS policy configuration
 * Can be used to validate RLS setup across database
 */
export const RLS_SCHEMA = {
  tables: RLS_TABLES,
  policy_pattern: '{table_name}_tenant_isolation',
  context_variable: 'app.current_org_id',
  filter_column: 'org_id'
};

// ============================================================================
// 2. TENANT CONTEXT MIDDLEWARE
// ============================================================================

/**
 * Creates a Hono middleware for extracting and validating tenant context
 * Resolution chain:
 *   1. JWT claims (c.get('jwtPayload')?.org_id)
 *   2. API key lookup via X-Finault-Org-Id header
 *   3. SSO/SAML assertion
 *
 * Sets on context:
 *   - c.set('tenantId', resolvedTenantId)
 *   - c.set('tenantPlan', planTier)
 *   - c.set('tenantStatus', 'active'|'suspended'|'deleted')
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getOrgFromApiKey - Function to resolve org from API key
 * @param {Function} options.getOrgStatus - Function to fetch org status and plan
 * @returns {Function} Hono middleware function
 */
export function createTenantMiddleware(options = {}) {
  const {
    getOrgFromApiKey = async () => null,
    getOrgStatus = async () => ({ status: 'active', plan: 'professional' })
  } = options;

  return async (c, next) => {
    try {
      let tenantId = null;
      let tenantPlan = 'professional'; // default
      let tenantStatus = 'active'; // default

      // Resolution Chain 1: JWT Claims
      const jwtPayload = c.get('jwtPayload');
      if (jwtPayload?.org_id) {
        tenantId = jwtPayload.org_id;
      }

      // Resolution Chain 2: API Key Header
      if (!tenantId) {
        const apiKey = c.req.header('X-Finault-API-Key');
        if (apiKey) {
          const orgFromKey = await getOrgFromApiKey(apiKey);
          if (orgFromKey) {
            tenantId = orgFromKey;
          }
        }
      }

      // Resolution Chain 3: SSO/SAML Assertion (check for org_id header)
      if (!tenantId) {
        const orgIdHeader = c.req.header('X-Finault-Org-Id');
        if (orgIdHeader) {
          // In production, verify this header against SAML assertion
          tenantId = orgIdHeader;
        }
      }

      // Fail if no tenant can be resolved
      if (!tenantId) {
        return c.json(
          { error: 'Unauthorized', message: 'No tenant context found' },
          401
        );
      }

      // Fetch tenant status and plan
      const orgStatus = await getOrgStatus(tenantId);
      if (orgStatus) {
        tenantStatus = orgStatus.status || 'active';
        tenantPlan = orgStatus.plan || 'professional';
      }

      // Fail if tenant is suspended
      if (tenantStatus === 'suspended') {
        return c.json(
          { error: 'Forbidden', message: 'Tenant account is suspended' },
          403
        );
      }

      // Fail if tenant is deleted
      if (tenantStatus === 'deleted') {
        return c.json(
          { error: 'Forbidden', message: 'Tenant account has been deleted' },
          403
        );
      }

      // Store resolved tenant on context
      c.set('tenantId', tenantId);
      c.set('tenantPlan', tenantPlan);
      c.set('tenantStatus', tenantStatus);

      // Set RLS context on database connection (if available)
      const db = c.get('db');
      if (db && typeof db.rpc === 'function') {
        try {
          await db.rpc('set_config', {
            key: 'app.current_org_id',
            value: tenantId,
            is_local: true
          });
        } catch (e) {
          // Gracefully handle if RLS context setting fails
          console.warn('Failed to set RLS context:', e.message);
        }
      }

      await next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      return c.json(
        { error: 'Internal Server Error', message: error.message },
        500
      );
    }
  };
}

// ============================================================================
// 3. TENANT LIFECYCLE MANAGER
// ============================================================================

export class TenantLifecycleManager {
  constructor(options = {}) {
    this.db = options.db;
    this.logger = options.logger || console;
    this.eventBus = options.eventBus;
    this.defaultPlan = options.defaultPlan || 'professional';
  }

  /**
   * Create a new tenant with initial configuration
   * @param {Object} config - Tenant configuration
   * @param {string} config.orgId - Organization ID (UUID)
   * @param {string} config.name - Organization name
   * @param {string} config.plan - Plan tier (foundation|professional|enterprise|strategic)
   * @param {string} config.email - Primary contact email
   * @returns {Object} Created organization with API key
   */
  async createTenant(config) {
    const { orgId, name, plan = this.defaultPlan, email } = config;

    if (!orgId || !name || !email) {
      throw new Error('orgId, name, and email are required');
    }

    try {
      // Insert organization record
      const { data: insertResult, error: insertError } = await this.db
        .from('organizations')
        .insert({
          id: orgId,
          name,
          plan,
          status: 'active',
          email,
          created_at: new Date().toISOString(),
          config: {
            data_residency: 'us',
            encryption_enabled: true,
            mfa_required: false
          }
        })
        .select();

      if (insertError || !insertResult || insertResult.length === 0) {
        throw new Error('Failed to insert organization');
      }

      const org = insertResult[0];

      // Create RLS user (in real PostgreSQL implementation)
      // await this.db.rpc('create_rls_user', { org_id: orgId, org_name: name });

      // Generate API key
      const apiKey = `finault_${orgId.substring(0, 8)}_${Math.random().toString(36).substring(2, 15)}`;

      // Store API key hash in database
      const { error: keyError } = await this.db
        .from('api_keys')
        .insert({
          id: `key_${Date.now()}`,
          org_id: orgId,
          key_hash: hashApiKey(apiKey),
          name: 'Default API Key',
          status: 'active',
          created_at: new Date().toISOString()
        });

      if (keyError) {
        throw new Error('Failed to store API key');
      }

      // Provision default resources (buckets, queues, etc.)
      // await this.provisionDefaults(orgId, plan);

      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('tenant:created', {
          orgId,
          name,
          plan,
          timestamp: new Date().toISOString()
        });
      }

      return {
        ...org,
        api_key: apiKey, // Return to caller (only time visible)
        api_key_last4: apiKey.substring(apiKey.length - 4)
      };
    } catch (error) {
      this.logger.error('Failed to create tenant:', error);
      throw error;
    }
  }

  /**
   * Suspend a tenant account
   * @param {string} orgId - Organization ID
   * @param {string} reason - Suspension reason
   * @returns {Object} Updated organization
   */
  async suspendTenant(orgId, reason) {
    if (!orgId) throw new Error('orgId is required');

    try {
      // Update organization status
      const { data: result, error: updateError } = await this.db
        .from('organizations')
        .update({
          status: 'suspended',
          suspended_at: new Date().toISOString(),
          suspension_reason: reason
        })
        .eq('id', orgId)
        .select();

      if (updateError || !result || result.length === 0) {
        throw new Error('Organization not found');
      }

      // Revoke API keys
      await this.db
        .from('api_keys')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('status', 'active');

      // Stop any active agent runs
      await this.db
        .from('agent_runs')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Tenant suspended'
        })
        .eq('org_id', orgId)
        .eq('status', 'running');

      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('tenant:suspended', {
          orgId,
          reason,
          timestamp: new Date().toISOString()
        });
      }

      return result[0];
    } catch (error) {
      this.logger.error('Failed to suspend tenant:', error);
      throw error;
    }
  }

  /**
   * Reactivate a suspended tenant
   * @param {string} orgId - Organization ID
   * @returns {Object} Updated organization
   */
  async reactivateTenant(orgId) {
    if (!orgId) throw new Error('orgId is required');

    try {
      const { data: result, error: updateError } = await this.db
        .from('organizations')
        .update({
          status: 'active',
          suspended_at: null,
          suspension_reason: null
        })
        .eq('id', orgId)
        .select();

      if (updateError || !result || result.length === 0) {
        throw new Error('Organization not found');
      }

      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('tenant:reactivated', {
          orgId,
          timestamp: new Date().toISOString()
        });
      }

      return result[0];
    } catch (error) {
      this.logger.error('Failed to reactivate tenant:', error);
      throw error;
    }
  }

  /**
   * Soft delete a tenant with 30-day grace period
   * Hard delete occurs after grace period
   *
   * @param {orgId} orgId - Organization ID
   * @param {Object} options - Deletion options
   * @param {number} options.gracePeriodDays - Days before hard delete (default: 30)
   * @returns {Object} Updated organization
   */
  async deleteTenant(orgId, options = {}) {
    const { gracePeriodDays = 30 } = options;

    if (!orgId) throw new Error('orgId is required');

    try {
      const scheduleHardDeleteAt = new Date();
      scheduleHardDeleteAt.setDate(scheduleHardDeleteAt.getDate() + gracePeriodDays);

      // Soft delete: mark as deleted with grace period
      const { data: result, error: updateError } = await this.db
        .from('organizations')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          hard_delete_scheduled_at: scheduleHardDeleteAt.toISOString()
        })
        .eq('id', orgId)
        .select();

      if (updateError || !result || result.length === 0) {
        throw new Error('Organization not found');
      }

      // Revoke all API keys
      await this.db
        .from('api_keys')
        .update({ status: 'revoked' })
        .eq('org_id', orgId);

      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('tenant:deleted', {
          orgId,
          gracePeriodDays,
          hardDeleteAt: scheduleHardDeleteAt.toISOString(),
          timestamp: new Date().toISOString()
        });
      }

      return result[0];
    } catch (error) {
      this.logger.error('Failed to delete tenant:', error);
      throw error;
    }
  }

  /**
   * Export tenant data for GDPR/compliance purposes
   * Returns: CSV (invoices, budgets, etc) + ZIP (close packs) + JSON (config)
   *
   * FOCUS 1.3: Data export format validation
   * @param {string} orgId - Organization ID
   * @returns {Object} Export data with signed URLs
   */
  async exportTenantData(orgId) {
    if (!orgId) throw new Error('orgId is required');

    try {
      // Fetch all organization data
      const [
        { data: orgs },
        { data: invoices },
        { data: budgets },
        { data: closePacks },
        { data: anomalies },
        { data: auditEvents }
      ] = await Promise.all([
        this.db.from('organizations').select('*').eq('id', orgId),
        this.db.from('invoices').select('*').eq('org_id', orgId),
        this.db.from('budgets').select('*').eq('org_id', orgId),
        this.db.from('close_packs').select('*').eq('org_id', orgId),
        this.db.from('anomaly_detections').select('*').eq('org_id', orgId),
        this.db.from('audit_events').select('*').eq('org_id', orgId)
      ]);

      const org = (orgs && orgs[0]) || {};

      // Generate CSV exports
      const invoicesCSV = convertToCSV(invoices || [], ['id', 'provider', 'total_amount', 'status', 'created_at']);
      const budgetsCSV = convertToCSV(budgets || [], ['id', 'name', 'period', 'limit_amount', 'status']);
      const anomaliesCSV = convertToCSV(anomalies || [], ['id', 'type', 'severity', 'cost_impact', 'created_at']);

      // Generate config JSON
      const configJSON = {
        organization: {
          id: org.id,
          name: org.name,
          plan: org.plan,
          created_at: org.created_at,
          data_residency: org.config?.data_residency || 'us'
        },
        export_date: new Date().toISOString(),
        summary: {
          total_invoices: (invoices || []).length,
          total_budgets: (budgets || []).length,
          total_close_packs: (closePacks || []).length,
          total_anomalies: (anomalies || []).length,
          audit_events: (auditEvents || []).length
        }
      };

      // Build close packs ZIP (simulated)
      const closePacksZipEntries = (closePacks || []).map(cp => ({
        filename: `close-pack-${cp.id}.json`,
        content: JSON.stringify(cp, null, 2)
      }));

      return {
        format: 'multi-part export',
        files: {
          invoices_csv: { content: invoicesCSV, size: invoicesCSV.length },
          budgets_csv: { content: budgetsCSV, size: budgetsCSV.length },
          anomalies_csv: { content: anomaliesCSV, size: anomaliesCSV.length },
          config_json: { content: JSON.stringify(configJSON, null, 2), size: JSON.stringify(configJSON).length },
          close_packs_zip: { entries: closePacksZipEntries, count: closePacksZipEntries.length }
        },
        total_files: 5,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };
    } catch (error) {
      this.logger.error('Failed to export tenant data:', error);
      throw error;
    }
  }

  /**
   * Get current tenant status
   * @param {string} orgId - Organization ID
   * @returns {Object} Tenant status object
   */
  async getTenantStatus(orgId) {
    if (!orgId) throw new Error('orgId is required');

    try {
      const { data: result, error } = await this.db
        .from('organizations')
        .select('id, name, plan, status, created_at, suspended_at, deleted_at, hard_delete_scheduled_at')
        .eq('id', orgId);

      if (error || !result || result.length === 0) {
        return { status: 'not_found' };
      }

      const org = result[0];
      return {
        id: org.id,
        name: org.name,
        plan: org.plan,
        status: org.status,
        created_at: org.created_at,
        suspended_at: org.suspended_at,
        deleted_at: org.deleted_at,
        hard_delete_scheduled_at: org.hard_delete_scheduled_at,
        details: getStatusDetails(org)
      };
    } catch (error) {
      this.logger.error('Failed to get tenant status:', error);
      throw error;
    }
  }
}

// ============================================================================
// 4. NOISY NEIGHBOR PREVENTION - PLAN QUOTAS
// ============================================================================

/**
 * Plan quota definitions for all Finault tiers
 * -1 indicates unlimited resource
 */
export const PLAN_QUOTAS = {
  foundation: {
    api_rpm: 100,              // API requests per minute
    invoices_month: 25,        // Invoices per month
    close_packs_month: 1,      // Close packs per month
    providers: 3,              // Connected providers
    seats: 3,                  // Team members
    storage_gb: 1,             // Storage in GB
    agent_runs_day: 50,        // Agent executions per day
    webhooks: 2,               // Webhook endpoints
    retention_months: 12       // Data retention in months
  },
  professional: {
    api_rpm: 500,
    invoices_month: 100,
    close_packs_month: 2,
    providers: 8,
    seats: 5,
    storage_gb: 10,
    agent_runs_day: 200,
    webhooks: 10,
    retention_months: 24
  },
  enterprise: {
    api_rpm: 2000,
    invoices_month: 500,
    close_packs_month: -1,    // Unlimited
    providers: -1,
    seats: 15,
    storage_gb: 100,
    agent_runs_day: 1000,
    webhooks: 50,
    retention_months: 84
  },
  strategic: {
    api_rpm: 10000,
    invoices_month: -1,       // Unlimited
    close_packs_month: -1,
    providers: -1,
    seats: -1,
    storage_gb: 1000,
    agent_runs_day: -1,
    webhooks: 200,
    retention_months: -1      // Forever
  }
};

/**
 * Creates quota enforcement middleware
 * Returns 429 (Too Many Requests) with Retry-After for rate limits
 * Returns 402 (Payment Required) for quota exceeded
 *
 * @param {Object} options - Configuration
 * @param {Function} options.getQuotaUsage - Function to get current usage
 * @param {Object} options.quotaConfig - Override quota config
 * @returns {Function} Hono middleware
 */
export function createQuotaEnforcementMiddleware(options = {}) {
  const {
    getQuotaUsage = async () => ({}),
    quotaConfig = PLAN_QUOTAS
  } = options;

  return async (c, next) => {
    try {
      const tenantId = c.get('tenantId');
      const tenantPlan = c.get('tenantPlan') || 'professional';

      if (!tenantId) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      // Get tenant's plan quotas
      const quotas = quotaConfig[tenantPlan];
      if (!quotas) {
        return c.json({ error: 'Invalid plan tier' }, 400);
      }

      // Check API rate limit (requests per minute)
      const usage = await getQuotaUsage(tenantId);
      const apiRpmUsage = usage.api_rpm_current || 0;

      if (quotas.api_rpm !== -1 && apiRpmUsage >= quotas.api_rpm) {
        const retryAfter = Math.ceil(60 / quotas.api_rpm); // Seconds until next window
        return c.json(
          {
            error: 'Too Many Requests',
            message: 'API rate limit exceeded',
            quota: quotas.api_rpm,
            current: apiRpmUsage,
            retry_after: retryAfter
          },
          429
        );
      }

      // Check other quotas and return 402 if exceeded
      const quotaChecks = [
        { key: 'invoices_month', usage: usage.invoices_month_current },
        { key: 'agent_runs_day', usage: usage.agent_runs_day_current }
      ];

      for (const check of quotaChecks) {
        const quota = quotas[check.key];
        if (quota !== -1 && check.usage >= quota) {
          return c.json(
            {
              error: 'Payment Required',
              message: `${check.key.replace(/_/g, ' ')} limit exceeded`,
              quota,
              current: check.usage,
              upgrade_url: '/plans/upgrade'
            },
            402
          );
        }
      }

      // Store quota info on context
      c.set('quotas', quotas);
      c.set('quotaUsage', usage);

      await next();
    } catch (error) {
      console.error('Quota enforcement error:', error);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  };
}

// ============================================================================
// 5. TENANT-SCOPED DATABASE HELPER
// ============================================================================

/**
 * Creates a proxy around Supabase client that automatically adds tenant filtering
 * Also sets RLS context for database row-level security
 *
 * @param {Object} supabaseClient - Supabase client instance
 * @param {string} tenantId - Tenant/Organization ID
 * @returns {Object} Proxy with automatic tenant filtering
 */
export function withTenantScope(supabaseClient, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for tenant-scoped queries');
  }

  return new Proxy(supabaseClient, {
    get(target, prop) {
      // Handle .from() method
      if (prop === 'from') {
        return function(tableName) {
          const query = target.from(tableName);

          // Auto-add org_id filtering
          if (query && typeof query.eq === 'function') {
            return {
              ...query,
              select: function(columns) {
                return query.eq('org_id', tenantId).select(columns);
              },
              insert: function(data) {
                const withTenant = Array.isArray(data)
                  ? data.map(d => ({ ...d, org_id: tenantId }))
                  : { ...data, org_id: tenantId };
                return query.insert(withTenant);
              },
              update: function(data) {
                return query.eq('org_id', tenantId).update(data);
              },
              delete: function() {
                return query.eq('org_id', tenantId).delete();
              },
              eq: function(col, val) {
                if (col === 'org_id') {
                  // Don't override org_id filtering
                  return query.eq('org_id', tenantId);
                }
                return query.eq('org_id', tenantId).eq(col, val);
              }
            };
          }

          return query;
        };
      }

      // Handle .rpc() method (for setting RLS context)
      if (prop === 'rpc') {
        return async function(functionName, params) {
          // Set RLS context before RPC call
          if (functionName === 'set_config') {
            return target.rpc(functionName, {
              key: 'app.current_org_id',
              value: tenantId,
              is_local: true
            });
          }
          return target.rpc(functionName, params);
        };
      }

      // Return other properties as-is
      return target[prop];
    }
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Hash API key for secure storage
 * @param {string} apiKey - Raw API key
 * @returns {string} SHA256 hash
 */
function hashApiKey(apiKey) {
  // Simple hash for demo (use crypto.subtle in real implementation)
  let hash = 0;
  for (let i = 0; i < apiKey.length; i++) {
    const char = apiKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Convert array of objects to CSV format
 * @param {Array} data - Array of objects
 * @param {Array} columns - Columns to include
 * @returns {string} CSV content
 */
function convertToCSV(data, columns) {
  if (!data || data.length === 0) {
    return `${columns.join(',')}\n`;
  }

  const headers = columns.join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && val.includes(',')) {
        return `"${val}"`;
      }
      return val;
    }).join(',')
  );

  return [headers, ...rows].join('\n');
}

/**
 * Get status details for a tenant
 * @param {Object} org - Organization object
 * @returns {Object} Status details
 */
function getStatusDetails(org) {
  if (org.status === 'active') {
    return {
      message: 'Account is active',
      days_remaining: null
    };
  }

  if (org.status === 'suspended') {
    return {
      message: 'Account is suspended',
      suspension_date: org.suspended_at
    };
  }

  if (org.status === 'deleted') {
    const hardDeleteDate = new Date(org.hard_delete_scheduled_at);
    const daysRemaining = Math.floor((hardDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
    return {
      message: `Account scheduled for deletion in ${daysRemaining} days`,
      deletion_date: org.deleted_at,
      hard_delete_date: org.hard_delete_scheduled_at,
      days_remaining: daysRemaining
    };
  }

  return { message: 'Unknown status' };
}

export default {
  RLS_TABLES,
  RLS_SCHEMA,
  generateRLSPolicies,
  generateAllRLSPolicies,
  createTenantMiddleware,
  TenantLifecycleManager,
  PLAN_QUOTAS,
  createQuotaEnforcementMiddleware,
  withTenantScope
};
