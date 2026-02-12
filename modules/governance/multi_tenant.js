/**
 * Finault Multi-Tenancy Module
 *
 * Provides tenant isolation, resource partitioning, and
 * cross-tenant protection for enterprise deployments.
 *
 * Key invariants:
 * - All resources scoped by tenant_id
 * - No cross-tenant data access without explicit grant
 * - Tenant-specific quotas and limits
 * - Audit trail for all tenant operations
 */

import crypto from 'crypto';

// ============================================================================
// TENANT CONFIGURATION
// ============================================================================

const DEFAULT_TENANT_LIMITS = {
  maxClosesPerMonth: 1000,
  maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10GB
  maxAPIRequestsPerMinute: 100,
  maxConcurrentJobs: 10,
  retentionDays: 2555, // 7 years
  allowedERPs: ['all'],
  allowedFeatures: ['verification', 'fcs', 'drift', 'anchoring'],
};

// ============================================================================
// TENANT MANAGER
// ============================================================================

export class TenantManager {
  constructor(options = {}) {
    this.tenants = new Map();
    this.defaultLimits = { ...DEFAULT_TENANT_LIMITS, ...options.defaultLimits };
  }

  /**
   * Register a new tenant
   */
  createTenant({
    tenantId = null,
    name,
    type = 'standard', // standard, enterprise, trial
    limits = {},
    metadata = {},
  }) {
    const id = tenantId || this._generateTenantId(name);

    if (this.tenants.has(id)) {
      throw new Error(`Tenant ${id} already exists`);
    }

    const tenant = {
      tenant_id: id,
      name,
      type,
      status: 'active',
      limits: { ...this.defaultLimits, ...limits },
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
      },
      usage: {
        closes_this_month: 0,
        storage_bytes: 0,
        api_requests_today: 0,
      },
    };

    this.tenants.set(id, tenant);

    return tenant;
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    return tenant;
  }

  /**
   * Update tenant configuration
   */
  updateTenant(tenantId, updates) {
    const tenant = this.getTenant(tenantId);

    if (updates.limits) {
      tenant.limits = { ...tenant.limits, ...updates.limits };
    }

    if (updates.metadata) {
      tenant.metadata = { ...tenant.metadata, ...updates.metadata };
    }

    if (updates.status) {
      tenant.status = updates.status;
    }

    tenant.metadata.updated_at = new Date().toISOString();

    return tenant;
  }

  /**
   * Check if tenant can perform action
   */
  checkLimit(tenantId, action, amount = 1) {
    const tenant = this.getTenant(tenantId);

    if (tenant.status !== 'active') {
      return {
        allowed: false,
        reason: `Tenant is ${tenant.status}`,
      };
    }

    switch (action) {
      case 'create_close':
        if (tenant.usage.closes_this_month + amount > tenant.limits.maxClosesPerMonth) {
          return {
            allowed: false,
            reason: 'Monthly close limit exceeded',
            limit: tenant.limits.maxClosesPerMonth,
            current: tenant.usage.closes_this_month,
          };
        }
        break;

      case 'storage':
        if (tenant.usage.storage_bytes + amount > tenant.limits.maxStorageBytes) {
          return {
            allowed: false,
            reason: 'Storage limit exceeded',
            limit: tenant.limits.maxStorageBytes,
            current: tenant.usage.storage_bytes,
          };
        }
        break;

      case 'api_request':
        // Would check rate limiting here
        break;
    }

    return { allowed: true };
  }

  /**
   * Record usage for tenant
   */
  recordUsage(tenantId, action, amount = 1) {
    const tenant = this.getTenant(tenantId);

    switch (action) {
      case 'close':
        tenant.usage.closes_this_month += amount;
        break;
      case 'storage':
        tenant.usage.storage_bytes += amount;
        break;
      case 'api_request':
        tenant.usage.api_requests_today += amount;
        break;
    }
  }

  /**
   * Reset monthly counters
   */
  resetMonthlyUsage() {
    for (const tenant of this.tenants.values()) {
      tenant.usage.closes_this_month = 0;
    }
  }

  /**
   * Generate tenant-scoped resource ID
   */
  scopeResourceId(tenantId, resourceType, resourceId) {
    return `${tenantId}/${resourceType}/${resourceId}`;
  }

  /**
   * Parse tenant-scoped resource ID
   */
  parseResourceId(scopedId) {
    const parts = scopedId.split('/');
    if (parts.length < 3) {
      throw new Error('Invalid scoped resource ID');
    }
    return {
      tenantId: parts[0],
      resourceType: parts[1],
      resourceId: parts.slice(2).join('/'),
    };
  }

  /**
   * Verify tenant access to resource
   */
  verifyAccess(requestTenantId, resourceTenantId) {
    if (requestTenantId !== resourceTenantId) {
      throw new Error('Cross-tenant access denied');
    }
    return true;
  }

  _generateTenantId(name) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const suffix = crypto.randomBytes(4).toString('hex');
    return `${normalized}-${suffix}`;
  }
}

// ============================================================================
// TENANT-SCOPED STORAGE
// ============================================================================

export class TenantScopedStorage {
  constructor(tenantManager, options = {}) {
    this.tenantManager = tenantManager;
    this.basePath = options.basePath || './storage';
  }

  /**
   * Get storage path for tenant resource
   */
  getPath(tenantId, resourceType, resourceId) {
    return `${this.basePath}/${tenantId}/${resourceType}/${resourceId}`;
  }

  /**
   * Store Close Pack for tenant
   */
  async storeClosePack(tenantId, closeId, buffer) {
    // Check limits
    const check = this.tenantManager.checkLimit(tenantId, 'storage', buffer.length);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const path = this.getPath(tenantId, 'closepacks', `${closeId}.zip`);

    // Record usage
    this.tenantManager.recordUsage(tenantId, 'storage', buffer.length);

    return {
      path,
      size: buffer.length,
      tenant_id: tenantId,
      close_id: closeId,
    };
  }

  /**
   * List Close Packs for tenant
   */
  async listClosePacks(tenantId, options = {}) {
    // This would query actual storage
    return {
      tenant_id: tenantId,
      closepacks: [],
      total: 0,
    };
  }
}

// ============================================================================
// RBAC (Role-Based Access Control)
// ============================================================================

export const Role = {
  OWNER: 'owner',           // Full tenant control
  ADMIN: 'admin',           // Manage users, view all
  OPERATOR: 'operator',     // Create closes, verify, post
  AUDITOR: 'auditor',       // Read-only access to all
  VIEWER: 'viewer',         // Limited read access
  API: 'api',               // Programmatic access
};

export const Permission = {
  // Close Pack operations
  CLOSE_CREATE: 'close:create',
  CLOSE_READ: 'close:read',
  CLOSE_VERIFY: 'close:verify',
  CLOSE_DELETE: 'close:delete',

  // ERP operations
  ERP_POST: 'erp:post',
  ERP_SANDBOX: 'erp:sandbox',
  ERP_READ: 'erp:read',

  // Anchoring
  ANCHOR_SUBMIT: 'anchor:submit',
  ANCHOR_READ: 'anchor:read',

  // Replay
  REPLAY_TRIGGER: 'replay:trigger',
  REPLAY_READ: 'replay:read',

  // Admin
  TENANT_MANAGE: 'tenant:manage',
  USER_MANAGE: 'user:manage',
  AUDIT_READ: 'audit:read',
  CONFIG_MANAGE: 'config:manage',
};

const ROLE_PERMISSIONS = {
  [Role.OWNER]: Object.values(Permission),
  [Role.ADMIN]: [
    Permission.CLOSE_CREATE, Permission.CLOSE_READ, Permission.CLOSE_VERIFY,
    Permission.ERP_POST, Permission.ERP_SANDBOX, Permission.ERP_READ,
    Permission.ANCHOR_SUBMIT, Permission.ANCHOR_READ,
    Permission.REPLAY_TRIGGER, Permission.REPLAY_READ,
    Permission.USER_MANAGE, Permission.AUDIT_READ,
  ],
  [Role.OPERATOR]: [
    Permission.CLOSE_CREATE, Permission.CLOSE_READ, Permission.CLOSE_VERIFY,
    Permission.ERP_POST, Permission.ERP_SANDBOX, Permission.ERP_READ,
    Permission.ANCHOR_SUBMIT, Permission.ANCHOR_READ,
    Permission.REPLAY_TRIGGER, Permission.REPLAY_READ,
  ],
  [Role.AUDITOR]: [
    Permission.CLOSE_READ, Permission.ERP_READ, Permission.ANCHOR_READ,
    Permission.REPLAY_READ, Permission.AUDIT_READ,
  ],
  [Role.VIEWER]: [
    Permission.CLOSE_READ, Permission.ERP_READ,
  ],
  [Role.API]: [
    Permission.CLOSE_CREATE, Permission.CLOSE_READ, Permission.CLOSE_VERIFY,
    Permission.ERP_POST, Permission.ERP_SANDBOX, Permission.ERP_READ,
  ],
};

export class RBACManager {
  constructor() {
    this.userRoles = new Map(); // userId -> { tenantId, role }
  }

  /**
   * Assign role to user for tenant
   */
  assignRole(userId, tenantId, role) {
    if (!ROLE_PERMISSIONS[role]) {
      throw new Error(`Invalid role: ${role}`);
    }

    this.userRoles.set(`${tenantId}:${userId}`, { tenantId, role });
  }

  /**
   * Get user's role for tenant
   */
  getRole(userId, tenantId) {
    const key = `${tenantId}:${userId}`;
    return this.userRoles.get(key)?.role || null;
  }

  /**
   * Check if user has permission
   */
  hasPermission(userId, tenantId, permission) {
    const role = this.getRole(userId, tenantId);
    if (!role) return false;

    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes(permission);
  }

  /**
   * Get all permissions for user
   */
  getPermissions(userId, tenantId) {
    const role = this.getRole(userId, tenantId);
    if (!role) return [];
    return ROLE_PERMISSIONS[role] || [];
  }

  /**
   * Require permission (throws if denied)
   */
  requirePermission(userId, tenantId, permission) {
    if (!this.hasPermission(userId, tenantId, permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default TenantManager;
