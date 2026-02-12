/**
 * QuickBooks Online ERP Service
 * Real OAuth2-based connector for QuickBooks Online API
 *
 * Features:
 * - OAuth 2.0 token refresh with automatic expiry handling
 * - Real HTTP calls to QBO API endpoints
 * - Journal entry posting with error handling and retries
 * - Company info retrieval and connection testing
 * - Proper error classification (auth, validation, server)
 *
 * Environment Variables:
 * - QB_CLIENT_ID: OAuth client ID from Intuit app
 * - QB_CLIENT_SECRET: OAuth client secret
 * - QB_REALM_ID: Company/Realm ID (set during initial connection)
 * - QB_REFRESH_TOKEN: Refresh token for automated token refresh
 */

import crypto from 'crypto';

/**
 * QuickBooks Online Service
 */
export class QuickBooksService {
  constructor(options = {}) {
    this.clientId = options.clientId || process.env.QB_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.QB_CLIENT_SECRET;
    this.realmId = options.realmId || process.env.QB_REALM_ID;
    this.refreshToken = options.refreshToken || process.env.QB_REFRESH_TOKEN;

    this.accessToken = options.accessToken || null;
    this.tokenExpiresAt = options.tokenExpiresAt || null;

    this.baseUrl = 'https://quickbooks.api.intuit.com/v3';
    this.authUrl = 'https://oauth.platform.intuit.com/oauth2';

    // Retry configuration
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 1000;
    this.timeoutMs = options.timeoutMs || 30000;

    // For Node.js compatibility - use global fetch if available, otherwise require node-fetch
    this.fetch = typeof fetch !== 'undefined' ? fetch : null;
  }

  /**
   * Authenticate and get initial access token using refresh token
   * Call this before making any API requests
   */
  async authenticate() {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        'QuickBooks OAuth requires clientId, clientSecret, and refreshToken'
      );
    }

    try {
      const result = await this.refreshToken();
      return {
        success: true,
        authenticated: true,
        realmId: this.realmId,
        tokenExpiresAt: this.tokenExpiresAt,
      };
    } catch (error) {
      return {
        success: false,
        error: `Authentication failed: ${error.message}`,
      };
    }
  }

  /**
   * Refresh OAuth2 access token using refresh token
   * Automatically called when token expires
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', this.refreshToken);

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64'
    );

    try {
      const response = await this._fetch(`${this.authUrl}/tokens/oauth2`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          `Token refresh failed: ${error.error_description || response.statusText}`
        );
      }

      const data = await response.json();

      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

      // Update refresh token if new one provided
      if (data.refresh_token) {
        this.refreshToken = data.refresh_token;
      }

      return {
        success: true,
        accessToken: this.accessToken,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      throw new Error(`Token refresh error: ${error.message}`);
    }
  }

  /**
   * Ensure access token is valid, refresh if needed
   */
  async ensureValidToken() {
    // If token doesn't exist or is expired, refresh it
    if (!this.accessToken || !this.tokenExpiresAt) {
      return await this.refreshAccessToken();
    }

    // Refresh if expiring within next 5 minutes
    const now = Date.now();
    const expiresIn = this.tokenExpiresAt - now;

    if (expiresIn < 5 * 60 * 1000) {
      return await this.refreshAccessToken();
    }

    return {
      success: true,
      accessToken: this.accessToken,
    };
  }

  /**
   * Test connection to QuickBooks
   */
  async testConnection() {
    try {
      await this.ensureValidToken();

      const result = await this._makeRequest('GET', '/company/1/companyinfo/1');

      return {
        success: true,
        connected: true,
        company: result.CompanyInfo.CompanyName,
        realmId: this.realmId,
      };
    } catch (error) {
      return {
        success: false,
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Get company information
   */
  async getCompanyInfo() {
    try {
      await this.ensureValidToken();

      const result = await this._makeRequest('GET', '/company/1/companyinfo/1');

      return {
        success: true,
        company: {
          id: result.CompanyInfo.Id,
          name: result.CompanyInfo.CompanyName,
          email: result.CompanyInfo.Email,
          website: result.CompanyInfo.WebAddr,
          phone: result.CompanyInfo.PrimaryPhone?.FreeFormNumber,
          legalEntity: result.CompanyInfo.LegalAddr,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Post journal entry to QuickBooks Online
   *
   * @param {Object} entry - Journal entry data
   * @param {string} entry.TxnDate - Transaction date (YYYY-MM-DD)
   * @param {string} entry.PrivateNote - Internal note
   * @param {Array} entry.Line - Journal lines
   * @returns {Object} - Posting result with documentId
   */
  async postJournalEntry(entry) {
    if (!entry || !entry.Line || entry.Line.length === 0) {
      return {
        success: false,
        error: 'Journal entry must have at least one line',
      };
    }

    try {
      await this.ensureValidToken();

      // Validate journal entry structure
      const validationError = this._validateJournalEntry(entry);
      if (validationError) {
        return {
          success: false,
          error: validationError,
        };
      }

      // Format entry for QuickBooks API
      const qbEntry = this._formatJournalEntry(entry);

      // Post with retry logic
      const result = await this._makeRequest(
        'POST',
        '/company/1/journalentry',
        qbEntry,
        3
      );

      return {
        success: true,
        documentId: result.JournalEntry.Id,
        syncToken: result.JournalEntry.SyncToken,
        txnNumber: result.JournalEntry.TxnNumber,
        postedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        retryable: this._isRetryableError(error),
      };
    }
  }

  /**
   * Get chart of accounts
   */
  async getChartOfAccounts() {
    try {
      await this.ensureValidToken();

      // Query all active accounts
      const query = "select * from Account where Active = true";
      const result = await this._makeRequest(
        'GET',
        `/company/1/query?query=${encodeURIComponent(query)}`
      );

      const accounts = (result.QueryResponse?.Account || []).map((account) => ({
        id: account.Id,
        name: account.Name,
        number: account.AcctNum,
        type: account.AccountType,
        active: account.Active,
      }));

      return {
        success: true,
        accounts,
        count: accounts.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate journal entry structure
   */
  _validateJournalEntry(entry) {
    if (!entry.TxnDate) {
      return 'Journal entry requires TxnDate';
    }

    if (!entry.Line || !Array.isArray(entry.Line)) {
      return 'Journal entry requires Line array';
    }

    if (entry.Line.length === 0) {
      return 'Journal entry must have at least one line';
    }

    // Validate each line
    for (let i = 0; i < entry.Line.length; i++) {
      const line = entry.Line[i];

      if (!line.DetailType) {
        return `Line ${i + 1} requires DetailType`;
      }

      if (line.DetailType === 'JournalEntryLineDetail') {
        if (!line.JournalEntryLineDetail) {
          return `Line ${i + 1} requires JournalEntryLineDetail`;
        }

        if (!line.JournalEntryLineDetail.AccountRef) {
          return `Line ${i + 1} requires AccountRef`;
        }

        if (!line.JournalEntryLineDetail.PostingType) {
          return `Line ${i + 1} requires PostingType (Debit or Credit)`;
        }

        if (!line.Amount && line.Amount !== 0) {
          return `Line ${i + 1} requires Amount`;
        }
      }
    }

    return null;
  }

  /**
   * Format entry for QuickBooks API
   */
  _formatJournalEntry(entry) {
    // Ensure all lines have proper structure
    const lines = entry.Line.map((line, idx) => ({
      ...line,
      Id: String(idx + 1),
      DetailType: line.DetailType || 'JournalEntryLineDetail',
      Amount: line.Amount || 0,
      JournalEntryLineDetail: {
        ...line.JournalEntryLineDetail,
        PostingType: line.JournalEntryLineDetail?.PostingType || 'Debit',
      },
    }));

    return {
      TxnDate: entry.TxnDate,
      Line: lines,
      PrivateNote: entry.PrivateNote || '',
      DocNumber: entry.DocNumber,
    };
  }

  /**
   * Make HTTP request to QuickBooks API with retry logic
   */
  async _makeRequest(method, endpoint, body = null, retries = 1) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._fetch(
          `${this.baseUrl}/company/${this.realmId}${endpoint}`,
          {
            method,
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : null,
            timeout: this.timeoutMs,
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          // If auth error, try to refresh token
          if (response.status === 401) {
            if (attempt === 0) {
              await this.refreshAccessToken();
              continue; // Retry with new token
            }
            throw new Error('Authentication failed - token refresh unsuccessful');
          }

          throw new Error(
            `API request failed: ${response.status} ${
              errorData.fault?.error?.[0]?.message || response.statusText
            }`
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error;

        // Determine if error is retryable
        if (!this._isRetryableError(error) || attempt === retries) {
          throw error;
        }

        // Exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Determine if error is retryable
   */
  _isRetryableError(error) {
    const message = error.message || '';

    // Network errors, timeouts, 5xx server errors are retryable
    return (
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('timeout') ||
      message.includes('5')
    );
  }

  /**
   * Wrapper for fetch to support both Node.js and browser
   */
  async _fetch(url, options) {
    if (this.fetch) {
      return this.fetch(url, options);
    }

    // Fallback for older Node.js versions
    try {
      const nodeFetch = await import('node-fetch').then((m) => m.default);
      return nodeFetch(url, options);
    } catch {
      throw new Error(
        'Fetch not available. Require Node.js 18+ or install node-fetch'
      );
    }
  }
}

export default QuickBooksService;
