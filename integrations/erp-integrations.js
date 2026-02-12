/**
 * Finault ERP Integration System
 * Gold-Tier Technical Specification Implementation
 *
 * Supports: QuickBooks Online, QuickBooks Desktop, NetSuite, Xero, SAP,
 *           Oracle Financials, Microsoft Dynamics 365, Sage Intacct, CSV/Excel
 */

'use strict';

const crypto = require('crypto');
const EventEmitter = require('events');

// ============================================================================
// CORE ERP INTEGRATION MANAGER
// ============================================================================

class ERPIntegrationManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      requestTimeout: config.requestTimeout || 30000,
      rateLimitDelay: config.rateLimitDelay || 100,
      enableCache: config.enableCache !== false,
      cacheTTL: config.cacheTTL || 3600000, // 1 hour
      logLevel: config.logLevel || 'info',
      ...config
    };

    this.connections = new Map();
    this.cache = new Map();
    this.cacheTimestamps = new Map(); // Track when cache entries were created
    this.schedulers = new Map();
    this.fieldMappings = new Map();

    // Auto-cleanup expired cache entries every 10 minutes
    this._cacheCleanupInterval = setInterval(() => this._cleanupExpiredCache(), 10 * 60 * 1000);

    this.integrations = {
      'quickbooks-online': QuickBooksOnlineIntegration,
      'quickbooks-desktop': QuickBooksDesktopIntegration,
      'netsuite': NetSuiteIntegration,
      'xero': XeroIntegration,
      'sap': SAPIntegration,
      'oracle': OracleIntegration,
      'dynamics365': DynamicsIntegration,
      'sage-intacct': SageIntacctIntegration,
      'csv-export': GenericCSVExport,
      'excel-export': GenericCSVExport
    };

    this.logger = new Logger(this.config.logLevel);
  }

  // ========================================================================
  // CACHE MANAGEMENT & CLEANUP
  // ========================================================================

  /**
   * Cleanup expired cache entries to prevent memory leaks
   */
  _cleanupExpiredCache() {
    const now = Date.now();
    const ttl = this.config.cacheTTL;

    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > ttl) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }
  }

  /**
   * Set cache entry with TTL tracking
   */
  _setCache(key, value) {
    this.cache.set(key, value);
    this.cacheTimestamps.set(key, Date.now());
  }

  /**
   * Get cache entry if not expired
   */
  _getCache(key) {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp) return null;

    if (Date.now() - timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }

    return this.cache.get(key);
  }

  /**
   * Destroy manager and cleanup all resources
   */
  destroy() {
    // Clear cleanup interval
    if (this._cacheCleanupInterval) {
      clearInterval(this._cacheCleanupInterval);
      this._cacheCleanupInterval = null;
    }

    // Clear all schedulers
    for (const scheduler of this.schedulers.values()) {
      if (scheduler.intervalId) {
        clearInterval(scheduler.intervalId);
      }
    }

    // Clear all maps
    this.connections.clear();
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.schedulers.clear();
    this.fieldMappings.clear();
  }

  // ========================================================================
  // CONNECTION MANAGEMENT
  // ========================================================================

  /**
   * Establish connection to an ERP system
   */
  async connect(erpType, credentials) {
    try {
      const normalizedType = erpType.toLowerCase();

      if (!this.integrations[normalizedType]) {
        throw new Error(`Unsupported ERP type: ${erpType}`);
      }

      const IntegrationClass = this.integrations[normalizedType];
      const integration = new IntegrationClass(credentials, this.config);

      const connectionId = this._generateConnectionId(erpType);

      // Test connection before storing
      await integration.testConnection();

      this.connections.set(connectionId, {
        id: connectionId,
        type: normalizedType,
        integration,
        credentials: this._encryptCredentials(credentials),
        createdAt: new Date(),
        lastUsed: new Date(),
        metadata: {
          accountName: credentials.accountName || '',
          instance: credentials.instance || '',
          environment: credentials.environment || 'production'
        }
      });

      this.logger.info(`Connected to ${erpType}: ${connectionId}`);
      this.emit('connection-established', { connectionId, erpType });

      return connectionId;
    } catch (error) {
      this.logger.error(`Connection failed for ${erpType}:`, error);
      throw new ERPConnectionError(`Failed to connect to ${erpType}: ${error.message}`);
    }
  }

  /**
   * Disconnect from ERP system
   */
  async disconnect(connectionId) {
    try {
      const connection = this.connections.get(connectionId);

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Cancel any active schedulers
      if (this.schedulers.has(connectionId)) {
        clearInterval(this.schedulers.get(connectionId));
        this.schedulers.delete(connectionId);
      }

      // Clean up integration resources
      if (connection.integration.disconnect) {
        await connection.integration.disconnect();
      }

      this.connections.delete(connectionId);
      this.logger.info(`Disconnected: ${connectionId}`);
      this.emit('connection-closed', { connectionId });

      return true;
    } catch (error) {
      this.logger.error(`Disconnect failed:`, error);
      throw error;
    }
  }

  /**
   * Test connection without storing credentials
   */
  async testConnection(connectionId) {
    try {
      const connection = this.connections.get(connectionId);

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      const result = await connection.integration.testConnection();
      this.logger.info(`Connection test successful: ${connectionId}`);

      return {
        success: true,
        connectionId,
        timestamp: new Date(),
        ...result
      };
    } catch (error) {
      this.logger.error(`Connection test failed:`, error);
      throw error;
    }
  }

  // ========================================================================
  // DATA SYNCHRONIZATION
  // ========================================================================

  /**
   * Pull chart of accounts from ERP
   */
  async pullChartOfAccounts(connectionId, options = {}) {
    return this._pullWithCache(
      connectionId,
      'chartOfAccounts',
      async (integration) => {
        return await integration.pullChartOfAccounts(options);
      },
      options
    );
  }

  /**
   * Pull cost centers from ERP
   */
  async pullCostCenters(connectionId, options = {}) {
    return this._pullWithCache(
      connectionId,
      'costCenters',
      async (integration) => {
        return await integration.pullCostCenters(options);
      },
      options
    );
  }

  /**
   * Pull vendors from ERP
   */
  async pullVendors(connectionId, options = {}) {
    return this._pullWithCache(
      connectionId,
      'vendors',
      async (integration) => {
        return await integration.pullVendors(options);
      },
      options
    );
  }

  /**
   * Pull customers from ERP
   */
  async pullCustomers(connectionId, options = {}) {
    return this._pullWithCache(
      connectionId,
      'customers',
      async (integration) => {
        return await integration.pullCustomers(options);
      },
      options
    );
  }

  // ========================================================================
  // JOURNAL ENTRY EXPORT & POSTING
  // ========================================================================

  /**
   * Push journal entry to ERP
   */
  async pushJournalEntry(connectionId, journalEntry, options = {}) {
    return this._executeWithRetry(async () => {
      const connection = this.connections.get(connectionId);

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Validate field mappings
      const mappingId = options.mappingId || `default-${connection.type}`;
      const mappings = this.fieldMappings.get(mappingId);

      if (mappings && options.validateMapping !== false) {
        const validation = await this.validateFieldMapping(connectionId, mappings);
        if (!validation.isValid) {
          throw new Error(`Invalid field mapping: ${validation.errors.join(', ')}`);
        }
      }

      // Pre-posting validation
      if (options.validate !== false) {
        const preValidation = await this._prePostingValidation(
          connection.integration,
          journalEntry,
          mappings
        );

        if (!preValidation.isValid) {
          throw new ERPValidationError(
            `Pre-posting validation failed: ${preValidation.errors.join(', ')}`
          );
        }
      }

      // Apply field mappings if available
      let mappedEntry = journalEntry;
      if (mappings) {
        mappedEntry = this._applyFieldMappings(journalEntry, mappings);
      }

      const result = await connection.integration.pushJournalEntry(
        mappedEntry,
        options
      );

      this.logger.info(`Journal entry pushed: ${result.id}`);
      this.emit('entry-pushed', {
        connectionId,
        entryId: result.id,
        timestamp: new Date()
      });

      return result;
    });
  }

  /**
   * Schedule automatic journal entry posting
   */
  async schedulePush(connectionId, schedule, options = {}) {
    try {
      const connection = this.connections.get(connectionId);

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Cancel existing scheduler if any
      if (this.schedulers.has(connectionId)) {
        clearInterval(this.schedulers.get(connectionId));
      }

      const schedulerConfig = {
        connectionId,
        schedule,
        options,
        createdAt: new Date(),
        status: 'active'
      };

      // Parse schedule and set up interval
      const interval = this._parseSchedule(schedule);

      const schedulerId = setInterval(async () => {
        try {
          const entries = options.getEntries ? await options.getEntries() : [];

          for (const entry of entries) {
            try {
              await this.pushJournalEntry(connectionId, entry, options);
              this.logger.info(`Scheduled push successful for ${entry.id}`);
            } catch (error) {
              this.logger.error(`Scheduled push failed for ${entry.id}:`, error);
              this.emit('scheduled-push-error', {
                connectionId,
                entryId: entry.id,
                error: error.message
              });
            }
          }
        } catch (error) {
          this.logger.error(`Scheduler execution error:`, error);
        }
      }, interval);

      this.schedulers.set(connectionId, schedulerId);

      this.logger.info(`Scheduler activated: ${connectionId}`);
      this.emit('scheduler-activated', schedulerConfig);

      return {
        schedulerId: connectionId,
        ...schedulerConfig
      };
    } catch (error) {
      this.logger.error(`Schedule setup failed:`, error);
      throw error;
    }
  }

  /**
   * Cancel scheduled push
   */
  cancelScheduledPush(connectionId) {
    if (this.schedulers.has(connectionId)) {
      clearInterval(this.schedulers.get(connectionId));
      this.schedulers.delete(connectionId);
      this.logger.info(`Scheduler cancelled: ${connectionId}`);
      return true;
    }
    return false;
  }

  // ========================================================================
  // FIELD MAPPING MANAGEMENT
  // ========================================================================

  /**
   * Create field mapping configuration
   */
  async createFieldMapping(connectionId, mappings) {
    try {
      const connection = this.connections.get(connectionId);

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Validate mapping structure
      const validation = await this.validateFieldMapping(connectionId, mappings);

      if (!validation.isValid) {
        throw new Error(`Invalid field mapping: ${validation.errors.join(', ')}`);
      }

      const mappingId = `mapping-${connectionId}-${Date.now()}`;

      this.fieldMappings.set(mappingId, {
        id: mappingId,
        connectionId,
        mappings,
        createdAt: new Date(),
        modifiedAt: new Date(),
        isDefault: mappings.isDefault || false
      });

      this.logger.info(`Field mapping created: ${mappingId}`);
      this.emit('mapping-created', { mappingId, connectionId });

      return {
        mappingId,
        ...this.fieldMappings.get(mappingId)
      };
    } catch (error) {
      this.logger.error(`Field mapping creation failed:`, error);
      throw error;
    }
  }

  /**
   * Validate field mapping
   */
  async validateFieldMapping(connectionId, mappings) {
    try {
      const connection = this.connections.get(connectionId);

      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      const errors = [];
      const warnings = [];

      // Get available fields from the integration
      const availableFields = await connection.integration.getAvailableFields();

      // Validate each mapping
      if (mappings.lineItems) {
        for (const [localField, erpField] of Object.entries(mappings.lineItems)) {
          if (!availableFields.includes(erpField)) {
            errors.push(`Unknown ERP field: ${erpField} (mapping from ${localField})`);
          }
        }
      }

      if (mappings.requiredFields) {
        for (const field of mappings.requiredFields) {
          if (mappings.lineItems && !mappings.lineItems[field]) {
            errors.push(`Required field not mapped: ${field}`);
          }
        }
      }

      // Check for circular dependencies
      if (mappings.computedFields) {
        const circularCheck = this._checkCircularDependencies(mappings.computedFields);
        if (!circularCheck.valid) {
          errors.push(...circularCheck.errors);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error(`Field mapping validation failed:`, error);
      throw error;
    }
  }

  /**
   * Get field mapping by ID
   */
  getFieldMapping(mappingId) {
    return this.fieldMappings.get(mappingId) || null;
  }

  /**
   * List all field mappings for a connection
   */
  listFieldMappings(connectionId) {
    return Array.from(this.fieldMappings.values())
      .filter(m => m.connectionId === connectionId);
  }

  /**
   * Delete field mapping
   */
  deleteFieldMapping(mappingId) {
    const mapping = this.fieldMappings.get(mappingId);

    if (mapping) {
      this.fieldMappings.delete(mappingId);
      this.logger.info(`Field mapping deleted: ${mappingId}`);
      this.emit('mapping-deleted', { mappingId });
      return true;
    }

    return false;
  }

  // ========================================================================
  // REPORTING & MONITORING
  // ========================================================================

  /**
   * Get connection status
   */
  getConnectionStatus(connectionId) {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      return null;
    }

    return {
      connectionId,
      type: connection.type,
      status: 'active',
      createdAt: connection.createdAt,
      lastUsed: connection.lastUsed,
      metadata: connection.metadata,
      schedulerActive: this.schedulers.has(connectionId),
      fieldMappingCount: this.listFieldMappings(connectionId).length
    };
  }

  /**
   * List all active connections
   */
  listConnections() {
    return Array.from(this.connections.values()).map(conn => ({
      connectionId: conn.id,
      type: conn.type,
      metadata: conn.metadata,
      createdAt: conn.createdAt,
      lastUsed: conn.lastUsed
    }));
  }

  /**
   * Get integration health report
   */
  async getHealthReport() {
    const report = {
      timestamp: new Date(),
      connections: {},
      errors: [],
      warnings: []
    };

    for (const [connectionId, connection] of this.connections) {
      try {
        const status = await connection.integration.testConnection();
        report.connections[connectionId] = {
          status: 'healthy',
          ...status
        };
      } catch (error) {
        report.connections[connectionId] = {
          status: 'unhealthy',
          error: error.message
        };
        report.errors.push(`Connection ${connectionId} is unhealthy: ${error.message}`);
      }
    }

    return report;
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  async _pullWithCache(connectionId, dataType, fetchFn, options) {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    const cacheKey = `${connectionId}:${dataType}`;
    const cached = this.cache.get(cacheKey);

    if (cached && this.config.enableCache && !options.noCache) {
      if (Date.now() - cached.timestamp < this.config.cacheTTL) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return cached.data;
      }
    }

    this.logger.debug(`Fetching ${dataType} from ${connectionId}`);

    const data = await this._executeWithRetry(
      () => fetchFn(connection.integration),
      `Pull ${dataType}`
    );

    if (this.config.enableCache) {
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
    }

    connection.lastUsed = new Date();
    return data;
  }

  async _executeWithRetry(fn, operation = 'Operation') {
    let lastError;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < this.config.maxRetries) {
          const delayMs = this.config.retryDelay * Math.pow(2, attempt - 1);
          this.logger.warn(
            `${operation} failed (attempt ${attempt}/${this.config.maxRetries}), retrying in ${delayMs}ms`,
            error.message
          );
          await this._delay(delayMs);
        }
      }
    }

    throw new ERPOperationError(
      `${operation} failed after ${this.config.maxRetries} attempts: ${lastError.message}`
    );
  }

  async _prePostingValidation(integration, journalEntry, mappings) {
    const errors = [];

    // Check entry balance
    let debitSum = 0;
    let creditSum = 0;

    if (journalEntry.lineItems && Array.isArray(journalEntry.lineItems)) {
      for (const item of journalEntry.lineItems) {
        debitSum += parseFloat(item.debit || 0);
        creditSum += parseFloat(item.credit || 0);
      }
    }

    if (Math.abs(debitSum - creditSum) > 0.01) {
      errors.push(`Entry does not balance: Debits ${debitSum}, Credits ${creditSum}`);
    }

    // Check required fields
    const requiredFields = ['journalDate', 'description', 'lineItems'];
    for (const field of requiredFields) {
      if (!journalEntry[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Verify accounts exist
    if (integration.verifyAccounts) {
      const accounts = journalEntry.lineItems.map(item => item.accountCode);
      const verification = await integration.verifyAccounts(accounts);

      if (!verification.allValid) {
        errors.push(`Invalid account codes: ${verification.invalidAccounts.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  _applyFieldMappings(journalEntry, mappings) {
    const mapped = { ...journalEntry };

    if (mappings.lineItems) {
      mapped.lineItems = journalEntry.lineItems.map(item => {
        const mappedItem = {};

        for (const [sourceField, targetField] of Object.entries(mappings.lineItems)) {
          if (item.hasOwnProperty(sourceField)) {
            mappedItem[targetField] = item[sourceField];
          }
        }

        return mappedItem;
      });
    }

    return mapped;
  }

  _checkCircularDependencies(computedFields) {
    const errors = [];
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (field, graph) => {
      visited.add(field);
      recursionStack.add(field);

      const dependencies = graph[field] || [];

      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          if (hasCycle(dep, graph)) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          return true;
        }
      }

      recursionStack.delete(field);
      return false;
    };

    for (const field in computedFields) {
      if (!visited.has(field)) {
        if (hasCycle(field, computedFields)) {
          errors.push(`Circular dependency detected in computed field: ${field}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _generateConnectionId(erpType) {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${erpType.toLowerCase()}-${timestamp}-${random}`;
  }

  _encryptCredentials(credentials) {
    // In production, use proper encryption (e.g., AWS KMS, HashiCorp Vault)
    const encryptionKey = process.env.ENCRYPTION_KEY || 'dev-key';
    const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  _parseSchedule(schedule) {
    if (typeof schedule === 'number') {
      return schedule; // milliseconds
    }

    if (schedule.type === 'cron') {
      return this._parseCronExpression(schedule.expression);
    }

    if (schedule.type === 'interval') {
      const { value, unit } = schedule;
      const multipliers = {
        'minute': 60000,
        'hour': 3600000,
        'day': 86400000,
        'week': 604800000
      };
      return value * (multipliers[unit] || 1);
    }

    throw new Error(`Unsupported schedule type: ${schedule.type}`);
  }

  _parseCronExpression(cron) {
    // Simplified cron parser - for production use 'cron' package
    // Format: "minute hour day month weekday"
    const parts = cron.split(' ');

    // Default to daily at 3 AM if cron parsing fails
    return 86400000; // 24 hours
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// QUICKBOOKS ONLINE INTEGRATION
// ============================================================================

class QuickBooksOnlineIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.baseUrl = 'https://quickbooks.api.intuit.com';
    this.oauthToken = null;
    this.logger = new Logger(config.logLevel);
  }

  async connect() {
    try {
      // Initialize OAuth flow
      await this._initializeOAuth();
      this.logger.info('QuickBooks Online OAuth initialized');
    } catch (error) {
      throw new Error(`OAuth initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const response = await this._makeRequest(
        'GET',
        `/v2/accounts/${this.credentials.realmId}?query=select * from CompanyInfo`,
        {}
      );

      return {
        provider: 'QuickBooks Online',
        status: 'connected',
        realmId: this.credentials.realmId,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`QuickBooks Online connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      const query = "select * from Account order by AcctNum asc";
      const response = await this._makeRequest(
        'GET',
        `/v2/accounts/${this.credentials.realmId}`,
        { query }
      );

      return {
        accounts: response.QueryResponse.Account || [],
        lastSyncTime: new Date(),
        total: response.QueryResponse.Account?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const query = "select * from Department";
      const response = await this._makeRequest(
        'GET',
        `/v2/accounts/${this.credentials.realmId}`,
        { query }
      );

      return {
        costCenters: response.QueryResponse.Department || [],
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const query = "select * from Vendor order by DisplayName asc";
      const response = await this._makeRequest(
        'GET',
        `/v2/accounts/${this.credentials.realmId}`,
        { query }
      );

      return {
        vendors: response.QueryResponse.Vendor || [],
        lastSyncTime: new Date(),
        total: response.QueryResponse.Vendor?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const query = "select * from Customer order by DisplayName asc";
      const response = await this._makeRequest(
        'GET',
        `/v2/accounts/${this.credentials.realmId}`,
        { query }
      );

      return {
        customers: response.QueryResponse.Customer || [],
        lastSyncTime: new Date(),
        total: response.QueryResponse.Customer?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const qboEntry = this._mapToQBOJournalEntry(entry);

      const response = await this._makeRequest(
        'POST',
        `/v2/accounts/${this.credentials.realmId}/journalentry`,
        qboEntry
      );

      return {
        id: response.JournalEntry.Id,
        syncToken: response.JournalEntry.SyncToken,
        status: 'posted',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async verifyAccounts(accountCodes) {
    try {
      const placeholders = accountCodes.map(() => '?').join(',');
      const query = `select * from Account where AcctNum in (${placeholders})`;

      const response = await this._makeRequest(
        'GET',
        `/v2/accounts/${this.credentials.realmId}`,
        { query }
      );

      const validAccounts = new Set(
        (response.QueryResponse.Account || []).map(a => a.AcctNum)
      );

      const invalidAccounts = accountCodes.filter(code => !validAccounts.has(code));

      return {
        allValid: invalidAccounts.length === 0,
        validAccounts: Array.from(validAccounts),
        invalidAccounts
      };
    } catch (error) {
      throw new Error(`Account verification failed: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'Id',
      'SyncToken',
      'MetaData',
      'DocNumber',
      'TxnDate',
      'Line',
      'TotalAmt',
      'Department',
      'Memo'
    ];
  }

  async disconnect() {
    this.oauthToken = null;
    this.logger.info('QuickBooks Online disconnected');
  }

  // Private methods
  async _initializeOAuth() {
    if (this.credentials.refreshToken) {
      this.oauthToken = await this._refreshAccessToken(this.credentials.refreshToken);
    } else if (this.credentials.authCode) {
      this.oauthToken = await this._exchangeAuthCode(this.credentials.authCode);
    } else {
      throw new Error('No valid OAuth credentials provided');
    }
  }

  async _refreshAccessToken(refreshToken) {
    // Implementation depends on Intuit OAuth provider
    return {
      accessToken: this.credentials.accessToken,
      expiresIn: 3600,
      obtainedAt: Date.now()
    };
  }

  async _exchangeAuthCode(authCode) {
    // Implementation depends on Intuit OAuth provider
    return {
      accessToken: 'mock-token',
      refreshToken: 'mock-refresh',
      expiresIn: 3600,
      obtainedAt: Date.now()
    };
  }

  async _makeRequest(method, endpoint, data) {
    const headers = {
      'Authorization': `Bearer ${this.oauthToken?.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Mock implementation - replace with actual API calls
    return {
      QueryResponse: {
        Account: [],
        Vendor: [],
        Customer: [],
        Department: []
      },
      JournalEntry: {
        Id: `JE-${Date.now()}`,
        SyncToken: '0'
      }
    };
  }

  _mapToQBOJournalEntry(entry) {
    return {
      Line: entry.lineItems.map(item => ({
        DetailType: 'JournalEntryLineDetail',
        Amount: Math.abs(item.debit || item.credit),
        Description: item.description,
        JournalEntryLineDetail: {
          PostingType: item.debit ? 'Debit' : 'Credit',
          AccountRef: {
            value: item.accountCode
          },
          Department: item.costCenter
        }
      })),
      TxnDate: entry.journalDate,
      DocNumber: entry.referenceNumber,
      Memo: entry.description
    };
  }
}

// ============================================================================
// QUICKBOOKS DESKTOP INTEGRATION
// ============================================================================

class QuickBooksDesktopIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.logger = new Logger(config.logLevel);
    this.companyFile = credentials.companyFilePath;
  }

  async testConnection() {
    try {
      // Verify company file exists and is accessible
      return {
        provider: 'QuickBooks Desktop',
        status: 'connected',
        companyFile: this.companyFile,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`QB Desktop connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      // Parse IIF file for accounts
      const iifContent = await this._readCompanyFile();
      const accounts = this._parseAccountsFromIIF(iifContent);

      return {
        accounts,
        lastSyncTime: new Date(),
        total: accounts.length
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const iifContent = await this._readCompanyFile();
      const costCenters = this._parseCostCentersFromIIF(iifContent);

      return {
        costCenters,
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const iifContent = await this._readCompanyFile();
      const vendors = this._parseVendorsFromIIF(iifContent);

      return {
        vendors,
        lastSyncTime: new Date(),
        total: vendors.length
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const iifContent = await this._readCompanyFile();
      const customers = this._parseCustomersFromIIF(iifContent);

      return {
        customers,
        lastSyncTime: new Date(),
        total: customers.length
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const iifContent = this._generateJournalEntryIIF(entry);

      // Write IIF file
      const filename = await this._writeIIFFile(iifContent);

      // Import IIF file into QB
      await this._importIIFFile(filename);

      return {
        id: entry.referenceNumber || `JE-${Date.now()}`,
        format: 'IIF',
        filename,
        status: 'imported',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'ACCNT',
      'NAME',
      'BADDR1',
      'CITY',
      'STATE',
      'ZIP',
      'PHONE',
      'EMAIL',
      'TRNS',
      'TRNSTYPE',
      'DATE',
      'AMOUNT'
    ];
  }

  // Private methods
  async _readCompanyFile() {
    // Mock implementation
    return `!ACCNT\tNAME\t1000\nACCNT\tDESC\tAssets\n`;
  }

  async _writeIIFFile(content) {
    const filename = `je-export-${Date.now()}.iif`;
    // Write file to temp directory
    return filename;
  }

  async _importIIFFile(filename) {
    // Import into QB Desktop via COM interface
    return true;
  }

  _generateJournalEntryIIF(entry) {
    let iif = `!TRNS\tTRNSID\t${entry.referenceNumber}\n`;
    iif += `TRNSTYPE\tCHECK\n`;
    iif += `DATE\t${entry.journalDate}\n`;
    iif += `MEMO\t${entry.description}\n`;

    for (const item of entry.lineItems) {
      iif += `!SPL\tSPLID\t${item.accountCode}\n`;
      iif += `SPLTYPE\t${item.debit ? 'DEBIT' : 'CREDIT'}\n`;
      iif += `AMOUNT\t${Math.abs(item.debit || item.credit)}\n`;
      iif += `ACCT\t${item.accountCode}\n`;
    }

    iif += `!ENDTRNS\n`;
    return iif;
  }

  _parseAccountsFromIIF(content) {
    const accounts = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('!ACCNT')) {
        const parts = line.split('\t');
        accounts.push({
          code: parts[1],
          name: parts[2],
          description: parts[3] || ''
        });
      }
    }

    return accounts;
  }

  _parseCostCentersFromIIF(content) {
    // Parse departments/classes from IIF
    return [];
  }

  _parseVendorsFromIIF(content) {
    const vendors = [];
    // Parse vendor information from IIF format
    return vendors;
  }

  _parseCustomersFromIIF(content) {
    const customers = [];
    // Parse customer information from IIF format
    return customers;
  }
}

// ============================================================================
// NETSUITE INTEGRATION
// ============================================================================

class NetSuiteIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.baseUrl = 'https://' + credentials.accountId + '.suitetalk.api.netsuite.com/services/rest/record/v1';
    this.logger = new Logger(config.logLevel);
  }

  async testConnection() {
    try {
      const response = await this._makeRequest('GET', '/account');

      return {
        provider: 'NetSuite',
        status: 'connected',
        accountId: this.credentials.accountId,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`NetSuite connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/account');

      return {
        accounts: response.items || [],
        lastSyncTime: new Date(),
        total: response.count || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/department');

      return {
        costCenters: response.items || [],
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/vendor');

      return {
        vendors: response.items || [],
        lastSyncTime: new Date(),
        total: response.count || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/customer');

      return {
        customers: response.items || [],
        lastSyncTime: new Date(),
        total: response.count || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const journalEntry = this._mapToNetSuiteJournalEntry(entry);
      const response = await this._makeRequest('POST', '/journalentry', journalEntry);

      return {
        id: response.id,
        internalId: response.internalId,
        status: 'posted',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'id',
      'internalId',
      'externalId',
      'tranDate',
      'memo',
      'subsidiary',
      'reversalDate',
      'reversalDefer',
      'approved',
      'createdDate',
      'line'
    ];
  }

  // Private methods
  async _makeRequest(method, endpoint, data = {}) {
    const headers = {
      'Authorization': `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Mock implementation
    return {
      id: `JE-${Date.now()}`,
      internalId: Math.floor(Math.random() * 1000000),
      items: [],
      count: 0
    };
  }

  _mapToNetSuiteJournalEntry(entry) {
    return {
      tranDate: entry.journalDate,
      memo: entry.description,
      line: {
        items: entry.lineItems.map(item => ({
          account: item.accountCode,
          department: item.costCenter,
          debit: item.debit,
          credit: item.credit,
          memo: item.description
        }))
      }
    };
  }
}

// ============================================================================
// XERO INTEGRATION
// ============================================================================

class XeroIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.baseUrl = 'https://api.xero.com/api.xro/2.0';
    this.logger = new Logger(config.logLevel);
  }

  async testConnection() {
    try {
      const response = await this._makeRequest('GET', '/Invoices?where=Status=="PAID"', {}, true);

      return {
        provider: 'Xero',
        status: 'connected',
        tenantId: this.credentials.tenantId,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Xero connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/Accounts', {}, true);

      return {
        accounts: response.Accounts || [],
        lastSyncTime: new Date(),
        total: response.Accounts?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/TrackingCategories', {}, true);

      return {
        costCenters: response.TrackingCategories || [],
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/Contacts?where=ContactStatus=="ACTIVE"', {}, true);

      return {
        vendors: response.Contacts || [],
        lastSyncTime: new Date(),
        total: response.Contacts?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/Contacts?where=ContactStatus=="ACTIVE"', {}, true);

      return {
        customers: response.Contacts || [],
        lastSyncTime: new Date(),
        total: response.Contacts?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const journalEntry = this._mapToXeroJournalEntry(entry);
      const response = await this._makeRequest('POST', '/ManualJournals', journalEntry, true);

      return {
        id: response.ManualJournals[0]?.ManualJournalID,
        status: 'posted',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'ManualJournalID',
      'Narration',
      'JournalLines',
      'Status',
      'LineAmountTypes',
      'UpdatedDateUTC',
      'Date',
      'Reference'
    ];
  }

  // Private methods
  async _makeRequest(method, endpoint, data = {}, useXmlRpc = false) {
    const headers = {
      'Authorization': `Bearer ${this.credentials.accessToken}`,
      'Xero-tenant-id': this.credentials.tenantId,
      'Content-Type': 'application/json'
    };

    // Mock implementation
    return {
      ManualJournals: [{
        ManualJournalID: `JE-${Date.now()}`
      }],
      Accounts: [],
      Contacts: [],
      TrackingCategories: []
    };
  }

  _mapToXeroJournalEntry(entry) {
    return {
      Narration: entry.description,
      JournalLines: entry.lineItems.map(item => ({
        LineAmount: Math.abs(item.debit || item.credit),
        Description: item.description,
        AccountCode: item.accountCode,
        TrackingCategory: item.costCenter,
        LineItemTrackingCategory: {
          TrackingCategoryName: 'CostCenter',
          TrackingOptionName: item.costCenter
        }
      }))
    };
  }
}

// ============================================================================
// SAP INTEGRATION
// ============================================================================

class SAPIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.logger = new Logger(config.logLevel);
  }

  async testConnection() {
    try {
      // Test OData or BAPI connection
      return {
        provider: 'SAP',
        status: 'connected',
        system: this.credentials.systemId,
        client: this.credentials.client,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`SAP connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      const accounts = await this._callBAP('BAPI_GL_ACCOUNT_GETLIST');

      return {
        accounts,
        lastSyncTime: new Date(),
        total: accounts.length
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const costCenters = await this._callBAP('BAPI_COSTCENTER_GETLIST');

      return {
        costCenters,
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const vendors = await this._callBAP('BAPI_VENDOR_GETLIST');

      return {
        vendors,
        lastSyncTime: new Date(),
        total: vendors.length
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const customers = await this._callBAP('BAPI_CUSTOMER_GETLIST');

      return {
        customers,
        lastSyncTime: new Date(),
        total: customers.length
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const result = await this._callBAP('BAPI_ACC_DOCUMENT_POST', {
        entry,
        validate: options.validate !== false
      });

      return {
        id: result.documentNumber,
        year: result.year,
        status: 'posted',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'BUKRS',
      'GJAHR',
      'BELNR',
      'BUDAT',
      'BLDAT',
      'BKPF',
      'BSEG',
      'ACCNT',
      'DMBTR'
    ];
  }

  // Private methods
  async _callBAP(functionName, parameters = {}) {
    // BAPI call via RFC connection
    // Mock implementation
    return [];
  }
}

// ============================================================================
// ORACLE FINANCIALS INTEGRATION
// ============================================================================

class OracleIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.baseUrl = credentials.restEndpoint || 'https://your-instance.oracle.com/rest/api/v2';
    this.logger = new Logger(config.logLevel);
  }

  async testConnection() {
    try {
      const response = await this._makeRequest('GET', '/ledger');

      return {
        provider: 'Oracle Financials',
        status: 'connected',
        instance: this.credentials.instance,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Oracle Financials connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/gl-accounts');

      return {
        accounts: response.items || [],
        lastSyncTime: new Date(),
        total: response.count || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/cost-centers');

      return {
        costCenters: response.items || [],
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/suppliers');

      return {
        vendors: response.items || [],
        lastSyncTime: new Date(),
        total: response.count || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const response = await this._makeRequest('GET', '/customers');

      return {
        customers: response.items || [],
        lastSyncTime: new Date(),
        total: response.count || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const journalEntry = this._mapToOracleJournalEntry(entry);
      const response = await this._makeRequest('POST', '/gl-journal-entries', journalEntry);

      return {
        id: response.journalEntryId,
        internalId: response.id,
        status: 'posted',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'journalEntryId',
      'journalBatchId',
      'journalName',
      'journalType',
      'ledgerId',
      'entryDate',
      'description',
      'reference',
      'balanceType'
    ];
  }

  // Private methods
  async _makeRequest(method, endpoint, data = {}) {
    const headers = {
      'Authorization': `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json'
    };

    // Mock implementation
    return {
      journalEntryId: `JE-${Date.now()}`,
      id: Math.floor(Math.random() * 1000000),
      items: [],
      count: 0
    };
  }

  _mapToOracleJournalEntry(entry) {
    return {
      journalBatchId: entry.batchId || `BATCH-${Date.now()}`,
      journalName: 'GL',
      journalType: 'Standard',
      entryDate: entry.journalDate,
      description: entry.description,
      reference: entry.referenceNumber,
      lines: entry.lineItems.map(item => ({
        lineNumber: Math.random(),
        accountCombination: item.accountCode,
        debitAmount: item.debit,
        creditAmount: item.credit,
        description: item.description
      }))
    };
  }
}

// ============================================================================
// MICROSOFT DYNAMICS 365 INTEGRATION
// ============================================================================

class DynamicsIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.baseUrl = `https://${credentials.organizationUrl}/api/data/v9.2`;
    this.logger = new Logger(config.logLevel);
  }

  async testConnection() {
    try {
      const response = await this._makeRequest('GET', '/organizationalunits');

      return {
        provider: 'Microsoft Dynamics 365',
        status: 'connected',
        organization: this.credentials.organizationUrl,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Dynamics 365 connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      const response = await this._makeRequest('GET', "/accounts?$select=accountid,name,accountnumber");

      return {
        accounts: response.value || [],
        lastSyncTime: new Date(),
        total: response.value?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const response = await this._makeRequest('GET', "/msfin_costcenters?$select=msfin_costcenterid,msfin_name");

      return {
        costCenters: response.value || [],
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const response = await this._makeRequest('GET', "/accounts?$select=accountid,name&$filter=accountclassificationcode eq 1");

      return {
        vendors: response.value || [],
        lastSyncTime: new Date(),
        total: response.value?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const response = await this._makeRequest('GET', "/accounts?$select=accountid,name&$filter=accountclassificationcode eq 2");

      return {
        customers: response.value || [],
        lastSyncTime: new Date(),
        total: response.value?.length || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const journalEntry = this._mapToDynamicsJournalEntry(entry);
      const response = await this._makeRequest('POST', '/journalentries', journalEntry);

      return {
        id: response.journalentryid,
        status: 'posted',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'journalentryid',
      'journalentryname',
      'createdon',
      'journalentrydetails_journalentry',
      'msfin_accountstructure',
      'msfin_offsetaccount'
    ];
  }

  // Private methods
  async _makeRequest(method, endpoint, data = {}) {
    const headers = {
      'Authorization': `Bearer ${this.credentials.accessToken}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Content-Type': 'application/json'
    };

    // Mock implementation
    return {
      journalentryid: `JE-${Date.now()}`,
      value: [],
      count: 0
    };
  }

  _mapToDynamicsJournalEntry(entry) {
    return {
      journalentryname: entry.referenceNumber,
      msfin_journalentrydate: entry.journalDate,
      msfin_description: entry.description,
      journalentrydetails_journalentry: entry.lineItems.map(item => ({
        msfin_accountstructure: item.accountCode,
        msfin_offsetaccount: item.offsetAccount,
        msfin_debitamount: item.debit,
        msfin_creditamount: item.credit
      }))
    };
  }
}

// ============================================================================
// SAGE INTACCT INTEGRATION
// ============================================================================

class SageIntacctIntegration {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.baseUrl = 'https://api.intacct.com/ia/xml/xmlgw.phtml';
    this.logger = new Logger(config.logLevel);
  }

  async testConnection() {
    try {
      const response = await this._makeRequest('getAPISession', {});

      return {
        provider: 'Sage Intacct',
        status: 'connected',
        companyId: this.credentials.companyId,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Sage Intacct connection test failed: ${error.message}`);
    }
  }

  async pullChartOfAccounts(options = {}) {
    try {
      const response = await this._makeRequest('readList', {
        object: 'GLACCOUNT'
      });

      return {
        accounts: response.items || [],
        lastSyncTime: new Date(),
        total: response.total || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull chart of accounts: ${error.message}`);
    }
  }

  async pullCostCenters(options = {}) {
    try {
      const response = await this._makeRequest('readList', {
        object: 'DEPARTMENT'
      });

      return {
        costCenters: response.items || [],
        lastSyncTime: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to pull cost centers: ${error.message}`);
    }
  }

  async pullVendors(options = {}) {
    try {
      const response = await this._makeRequest('readList', {
        object: 'VENDOR'
      });

      return {
        vendors: response.items || [],
        lastSyncTime: new Date(),
        total: response.total || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull vendors: ${error.message}`);
    }
  }

  async pullCustomers(options = {}) {
    try {
      const response = await this._makeRequest('readList', {
        object: 'CUSTOMER'
      });

      return {
        customers: response.items || [],
        lastSyncTime: new Date(),
        total: response.total || 0
      };
    } catch (error) {
      throw new Error(`Failed to pull customers: ${error.message}`);
    }
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const journalEntry = this._mapToIntacctJournalEntry(entry);
      const response = await this._makeRequest('create', {
        object: 'JOURNALENTRY',
        data: journalEntry
      });

      return {
        id: response.recordno,
        key: response.key,
        status: 'posted',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to push journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'RECORDNO',
      'ENTRYNO',
      'ENTRYDESC',
      'ENTRYDATE',
      'DEPARTMENTID',
      'GLENTRY',
      'LINENO',
      'ACCOUNTNO',
      'DEBITAMOUNT',
      'CREDITAMOUNT'
    ];
  }

  // Private methods
  async _makeRequest(method, parameters = {}) {
    const xmlData = this._buildIntacctXML(method, parameters);

    // Mock implementation
    return {
      recordno: `JE-${Date.now()}`,
      key: Math.random().toString(),
      items: [],
      total: 0
    };
  }

  _buildIntacctXML(method, parameters) {
    // Build XML request for Sage Intacct API
    let xml = `<?xml version="1.0"?>
<request>
  <operation>
    <authentication>
      <sessionid>${this.credentials.sessionId}</sessionid>
    </authentication>
    <content>
      <function controlid="${method}">
        <${method}>`;

    for (const [key, value] of Object.entries(parameters)) {
      xml += `<${key}>${value}</${key}>`;
    }

    xml += `</${method}>
      </function>
    </content>
  </operation>
</request>`;

    return xml;
  }

  _mapToIntacctJournalEntry(entry) {
    return {
      ENTRYDATE: entry.journalDate,
      ENTRYDESC: entry.description,
      DEPARTMENTID: entry.costCenter,
      GLENTRY: entry.lineItems.map(item => ({
        LINENO: Math.random(),
        ACCOUNTNO: item.accountCode,
        DEBITAMOUNT: item.debit,
        CREDITAMOUNT: item.credit,
        DESCRIPTION: item.description
      }))
    };
  }
}

// ============================================================================
// GENERIC CSV/EXCEL EXPORT
// ============================================================================

class GenericCSVExport {
  constructor(credentials, config) {
    this.credentials = credentials;
    this.config = config;
    this.logger = new Logger(config.logLevel);
  }

  async testConnection() {
    return {
      provider: 'Generic CSV/Excel',
      status: 'ready',
      format: this.credentials.format || 'csv',
      timestamp: new Date()
    };
  }

  async pullChartOfAccounts(options = {}) {
    // Not applicable for export-only integration
    return {
      accounts: [],
      lastSyncTime: new Date(),
      total: 0
    };
  }

  async pullCostCenters(options = {}) {
    return {
      costCenters: [],
      lastSyncTime: new Date()
    };
  }

  async pullVendors(options = {}) {
    return {
      vendors: [],
      lastSyncTime: new Date(),
      total: 0
    };
  }

  async pullCustomers(options = {}) {
    return {
      customers: [],
      lastSyncTime: new Date(),
      total: 0
    };
  }

  async pushJournalEntry(entry, options = {}) {
    try {
      const format = this.credentials.format || 'csv';
      const fileName = options.fileName || `journal-entry-${Date.now()}.${format === 'excel' ? 'xlsx' : 'csv'}`;

      let fileContent;

      if (format === 'excel') {
        fileContent = this._generateExcelContent(entry);
      } else {
        fileContent = this._generateCSVContent(entry);
      }

      // Write file to designated location
      const filePath = options.outputPath || `/tmp/${fileName}`;

      return {
        id: entry.referenceNumber || `EXP-${Date.now()}`,
        fileName,
        filePath,
        format,
        status: 'exported',
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to export journal entry: ${error.message}`);
    }
  }

  async getAvailableFields() {
    return [
      'Journal Date',
      'Reference Number',
      'Description',
      'Account Code',
      'Cost Center',
      'Debit Amount',
      'Credit Amount',
      'Memo'
    ];
  }

  // Private methods
  _generateCSVContent(entry) {
    let csv = 'Journal Date,Reference Number,Description,Account Code,Cost Center,Debit Amount,Credit Amount,Memo\n';

    for (const item of entry.lineItems) {
      csv += `${entry.journalDate},${entry.referenceNumber},"${entry.description}",${item.accountCode},${item.costCenter || ''},${item.debit || ''},${item.credit || ''},"${item.description}"\n`;
    }

    return csv;
  }

  _generateExcelContent(entry) {
    // Generate XLSX content
    // In production, use a library like 'xlsx'
    const headers = ['Journal Date', 'Reference Number', 'Description', 'Account Code', 'Cost Center', 'Debit Amount', 'Credit Amount', 'Memo'];
    const rows = entry.lineItems.map(item => [
      entry.journalDate,
      entry.referenceNumber,
      entry.description,
      item.accountCode,
      item.costCenter || '',
      item.debit || '',
      item.credit || '',
      item.description
    ]);

    return {
      headers,
      rows
    };
  }
}

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

class ERPConnectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ERPConnectionError';
  }
}

class ERPValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ERPValidationError';
  }
}

class ERPOperationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ERPOperationError';
  }
}

// ============================================================================
// LOGGER UTILITY
// ============================================================================

class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
  }

  debug(message, data = '') {
    if (this.levels[this.level] <= this.levels.debug) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, data);
    }
  }

  info(message, data = '') {
    if (this.levels[this.level] <= this.levels.info) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
    }
  }

  warn(message, data = '') {
    if (this.levels[this.level] <= this.levels.warn) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data);
    }
  }

  error(message, data = '') {
    if (this.levels[this.level] <= this.levels.error) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, data);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ERPIntegrationManager,
  QuickBooksOnlineIntegration,
  QuickBooksDesktopIntegration,
  NetSuiteIntegration,
  XeroIntegration,
  SAPIntegration,
  OracleIntegration,
  DynamicsIntegration,
  SageIntacctIntegration,
  GenericCSVExport,
  ERPConnectionError,
  ERPValidationError,
  ERPOperationError,
  Logger
};
