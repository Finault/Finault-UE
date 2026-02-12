/**
 * Finault Integration Test — Database Client
 *
 * Direct PostgreSQL client for integration testing against a real database.
 * Uses the pg package to connect to the docker-compose postgres instance.
 * Provides transaction-based test isolation (BEGIN/ROLLBACK per test).
 */

import pg from 'pg';
const { Pool } = pg;

const DEFAULT_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'finault',
  password: process.env.POSTGRES_PASSWORD || 'finault_dev',
  database: process.env.POSTGRES_DB || 'finault_agentos',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

/**
 * Create a test database client with connection pooling and retry logic.
 * @param {object} configOverrides - Optional pg Pool config overrides
 * @returns {Promise<TestClient>}
 */
export async function createTestClient(configOverrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };

  // Support POSTGRES_URL as a single connection string
  if (process.env.POSTGRES_URL) {
    config.connectionString = process.env.POSTGRES_URL;
    delete config.host;
    delete config.port;
    delete config.user;
    delete config.password;
    delete config.database;
  }

  const pool = new Pool(config);

  // Retry connection up to 3 times (docker may be starting)
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        const delayMs = attempt * 2000;
        console.log(`[db-client] Connection attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // If all retries failed, throw
  if (lastError) {
    try {
      await pool.query('SELECT 1');
    } catch {
      throw new Error(
        `[db-client] Could not connect to PostgreSQL after 3 attempts. ` +
        `Is docker-compose postgres running? Error: ${lastError.message}`
      );
    }
  }

  return {
    pool,

    /**
     * Execute a SQL query against the pool.
     * @param {string} text - SQL query
     * @param {any[]} params - Query parameters
     * @returns {Promise<pg.QueryResult>}
     */
    async query(text, params = []) {
      return pool.query(text, params);
    },

    /**
     * Get a dedicated client from the pool (for transactions).
     * Caller must release the client when done.
     * @returns {Promise<pg.PoolClient>}
     */
    async getClient() {
      return pool.connect();
    },

    /**
     * Run a test function inside a transaction that automatically rolls back.
     * This ensures complete isolation between tests — no data leaks.
     *
     * @param {function(TransactionClient): Promise<void>} fn - Test function receiving a transaction-scoped client
     */
    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Create a transaction-scoped client wrapper
        const txClient = {
          async query(text, params = []) {
            return client.query(text, params);
          },
          /**
           * Set the tenant context for RLS policies.
           * Uses PostgreSQL current_setting() which our test auth stubs read.
           */
          async setTenantContext(orgId, role = 'admin') {
            await client.query(`SET LOCAL app.current_org_id = '${orgId}'`);
            await client.query(`SET LOCAL app.current_user_role = '${role}'`);
          },
          /**
           * Clear tenant context (simulate unauthenticated request).
           */
          async clearTenantContext() {
            await client.query(`RESET app.current_org_id`);
            await client.query(`RESET app.current_user_role`);
          },
          /**
           * Bypass RLS by setting role to the table owner (postgres superuser).
           * Use for setup/teardown operations that need to see all data.
           */
          async bypassRLS() {
            await client.query('SET LOCAL ROLE finault');
          },
          /**
           * Re-enable RLS enforcement by switching to a restricted role.
           */
          async enforceRLS(roleName = 'finault_app') {
            await client.query(`SET LOCAL ROLE ${roleName}`);
          },
        };

        await fn(txClient);
      } finally {
        // Always rollback — test data never persists
        await client.query('ROLLBACK');
        client.release();
      }
    },

    /**
     * Close the pool. Call in afterAll().
     */
    async close() {
      await pool.end();
    },
  };
}

/**
 * Check if postgres is reachable. Useful for conditional test skipping.
 * @returns {Promise<boolean>}
 */
export async function isPostgresAvailable() {
  const pool = new Pool({ ...DEFAULT_CONFIG, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    await pool.end();
    return true;
  } catch {
    try { await pool.end(); } catch { /* ignore */ }
    return false;
  }
}
