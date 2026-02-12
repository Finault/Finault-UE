/**
 * Transparency Log - Usage Examples
 *
 * Demonstrates integration with Cloudflare Workers, REST APIs, and client verification
 */

const { TransparencyLog, computeLeafHash, computeMerkleRoot, verifyInclusionProof } = require('./transparency-log');

// ============================================================================
// EXAMPLE 1: Cloudflare Worker Endpoint
// ============================================================================

/**
 * Cloudflare Worker handler for appending to transparency log
 * POST /api/transparency/append
 * Body: { closeId, attestationHash, orgId }
 */
const appendHandler = async (request, env) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { closeId, attestationHash, orgId } = await request.json();

    // Validate inputs
    if (!closeId || !attestationHash || !orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize log
    const log = new TransparencyLog({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
    });

    // Append entry
    const result = await log.append(closeId, attestationHash, orgId);

    // Return signed result
    return new Response(
      JSON.stringify({
        success: true,
        data: result
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Append error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ============================================================================
// EXAMPLE 2: Get Signed Tree Head Endpoint
// ============================================================================

/**
 * GET /api/transparency/tree-head
 * Returns the current signed tree head (root hash)
 */
const treeHeadHandler = async (request, env) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const log = new TransparencyLog({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
    });

    const treeHead = await log.getSignedTreeHead();

    return new Response(
      JSON.stringify({
        success: true,
        data: treeHead
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Tree head error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ============================================================================
// EXAMPLE 3: Get Inclusion Proof Endpoint
// ============================================================================

/**
 * GET /api/transparency/proof/:closeId
 * Returns Merkle inclusion proof for a specific close pack
 */
const proofHandler = async (request, env, closeId) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    if (!closeId) {
      return new Response(
        JSON.stringify({ error: 'Missing closeId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const log = new TransparencyLog({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
    });

    const proof = await log.getInclusionProof(closeId);

    return new Response(
      JSON.stringify({
        success: proof.found,
        data: proof
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Proof error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ============================================================================
// EXAMPLE 4: Client-Side Verification
// ============================================================================

/**
 * Client-side function to verify a close pack's commitment
 * This would run in the browser or mobile app
 */
async function verifyClosePackInLog(closeId) {
  try {
    // 1. Get the signed tree head (public, verifiable state)
    const treeHeadResponse = await fetch('/api/transparency/tree-head');
    const { data: treeHead } = await treeHeadResponse.json();

    // 2. Get the inclusion proof for this close pack
    const proofResponse = await fetch(`/api/transparency/proof/${closeId}`);
    const { success, data: proofData } = await proofResponse.json();

    if (!success) {
      console.log('Close pack not found in transparency log');
      return false;
    }

    // 3. Verify the proof client-side
    // This imports verifyInclusionProof from the module
    const isValid = await verifyInclusionProof(
      proofData.leafHash,
      proofData.proof,
      treeHead.rootHash  // Use latest tree head for verification
    );

    if (isValid) {
      console.log(
        `✓ Close pack ${closeId} is committed in the transparency log at index ${proofData.logIndex}`,
        `Tree size: ${treeHead.treeSize}`,
        `Root: ${treeHead.rootHash.substring(0, 16)}...`
      );
      return true;
    } else {
      console.log('Proof verification failed');
      return false;
    }
  } catch (error) {
    console.error('Verification error:', error);
    return false;
  }
}

// ============================================================================
// EXAMPLE 5: Consistency Proof (Audit Trail)
// ============================================================================

/**
 * GET /api/transparency/consistency?from=10&to=50
 * Proves that the log at size 10 is a prefix of the log at size 50
 */
const consistencyHandler = async (request, env) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const fromSize = parseInt(url.searchParams.get('from') || '0');
    const toSize = parseInt(url.searchParams.get('to') || '0');

    if (fromSize < 0 || toSize < 0 || fromSize > toSize) {
      return new Response(
        JSON.stringify({ error: 'Invalid size parameters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const log = new TransparencyLog({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
    });

    const consistency = await log.getConsistencyProof(fromSize, toSize);

    return new Response(
      JSON.stringify({
        success: consistency.consistent,
        data: consistency
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Consistency error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ============================================================================
// EXAMPLE 6: Log Audit (Get Entries)
// ============================================================================

/**
 * GET /api/transparency/entries?start=0&end=9
 * Returns paginated transparency log entries
 */
const entriesHandler = async (request, env) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const start = parseInt(url.searchParams.get('start') || '0');
    const end = parseInt(url.searchParams.get('end') || '9');

    if (start < 0 || end < start) {
      return new Response(
        JSON.stringify({ error: 'Invalid range' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const log = new TransparencyLog({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
    });

    const entries = await log.getEntries(start, end);

    return new Response(
      JSON.stringify({
        success: true,
        data: entries,
        pagination: { start, end, total: entries.length }
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Entries error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// ============================================================================
// EXAMPLE 7: Batch Append (Multiple Close Packs)
// ============================================================================

/**
 * Appends multiple close packs to the log
 * Note: Each append updates the root, so calling this sequentially is correct
 */
async function batchAppend(closePacksData, env) {
  const log = new TransparencyLog({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_KEY: env.SUPABASE_KEY,
    ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
  });

  const results = [];

  for (const { closeId, attestationHash, orgId } of closePacksData) {
    try {
      const result = await log.append(closeId, attestationHash, orgId);
      results.push({
        closeId,
        success: true,
        logIndex: result.logIndex,
        rootHash: result.rootHash
      });
    } catch (error) {
      results.push({
        closeId,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

// ============================================================================
// EXAMPLE 8: Integration with Close Pack Service
// ============================================================================

/**
 * Service layer for close packs with transparency logging
 */
class ClosePackService {
  constructor(env) {
    this.env = env;
    this.log = new TransparencyLog({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
    });
  }

  /**
   * Creates and attests a close pack
   */
  async createClosePack(closePackData, orgId) {
    // 1. Create the close pack in main DB
    const closePack = await this._createInDatabase(closePackData, orgId);

    // 2. Compute attestation hash
    const attestationHash = await this._computeAttestation(closePack);

    // 3. Append to transparency log
    const logResult = await this.log.append(
      closePack.id,
      attestationHash,
      orgId
    );

    // 4. Return enhanced response
    return {
      ...closePack,
      attestation: {
        hash: attestationHash,
        logIndex: logResult.logIndex,
        treeSize: logResult.treeSize,
        rootHash: logResult.rootHash,
        timestamp: logResult.timestamp
      }
    };
  }

  /**
   * Verifies a close pack's attestation
   */
  async verifyClosePack(closeId) {
    // 1. Get the proof
    const proof = await this.log.getInclusionProof(closeId);

    if (!proof.found) {
      return { verified: false, reason: 'Not found in transparency log' };
    }

    // 2. Get current tree head
    const treeHead = await this.log.getSignedTreeHead();

    // 3. Verify the proof
    const isValid = await this.log.verifyInclusionProof(
      proof.leafHash,
      proof.proof,
      treeHead.rootHash
    );

    return {
      verified: isValid,
      logIndex: proof.logIndex,
      treeSize: treeHead.treeSize,
      rootHash: treeHead.rootHash
    };
  }

  async _createInDatabase(data, orgId) {
    // Implement actual database write
    return {
      id: `close-${Date.now()}`,
      ...data,
      orgId,
      createdAt: new Date()
    };
  }

  async _computeAttestation(closePack) {
    // Implement attestation computation
    const attestData = JSON.stringify(closePack);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attestData));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// ============================================================================
// EXAMPLE 9: Monitoring and Alerts
// ============================================================================

/**
 * Monitors transparency log for anomalies
 */
class TransparencyMonitor {
  constructor(env, alertWebhook) {
    this.log = new TransparencyLog({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      ANCHOR_PRIVATE_KEY: env.ANCHOR_PRIVATE_KEY
    });
    this.alertWebhook = alertWebhook;
    this.lastKnownRoot = null;
    this.lastKnownSize = 0;
  }

  /**
   * Periodically checks for log anomalies
   */
  async checkHealth() {
    try {
      const treeHead = await this.log.getSignedTreeHead();

      // Check 1: Tree only grows
      if (treeHead.treeSize < this.lastKnownSize) {
        await this._alert('CRITICAL: Tree size decreased! Possible tampering detected.');
      }

      // Check 2: Root changes are consistent
      // (In production, verify against signed tree head)
      if (this.lastKnownRoot && this.lastKnownRoot !== treeHead.rootHash) {
        console.log(`Tree root changed. Size: ${this.lastKnownSize} → ${treeHead.treeSize}`);
      }

      // Update known state
      this.lastKnownRoot = treeHead.rootHash;
      this.lastKnownSize = treeHead.treeSize;

      return { healthy: true, treeSize: treeHead.treeSize };
    } catch (error) {
      await this._alert(`ERROR: Health check failed: ${error.message}`);
      return { healthy: false, error: error.message };
    }
  }

  async _alert(message) {
    if (this.alertWebhook) {
      await fetch(this.alertWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: message,
          timestamp: new Date().toISOString()
        })
      });
    }
    console.error(message);
  }
}

// ============================================================================
// EXAMPLE 10: Wrangler Worker Configuration
// ============================================================================

/**
 * Example wrangler.toml configuration
 *
 * [env.production]
 * name = "finault-transparency-log-prod"
 * route = "https://transparency.finault.app/*"
 * vars = { ENVIRONMENT = "production" }
 *
 * [env.production.env]
 * SUPABASE_URL = "https://project.supabase.co"
 * SUPABASE_KEY = "****"  # Store in .wrangler/env.production
 * ANCHOR_PRIVATE_KEY = "****"  # Store securely
 */

/**
 * Example Cloudflare Worker entry point
 */
const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route based on path
    if (pathname === '/api/transparency/append') {
      return appendHandler(request, env);
    } else if (pathname === '/api/transparency/tree-head') {
      return treeHeadHandler(request, env);
    } else if (pathname.startsWith('/api/transparency/proof/')) {
      const closeId = pathname.split('/').pop();
      return proofHandler(request, env, closeId);
    } else if (pathname === '/api/transparency/consistency') {
      return consistencyHandler(request, env);
    } else if (pathname === '/api/transparency/entries') {
      return entriesHandler(request, env);
    } else {
      return new Response('Not found', { status: 404 });
    }
  }
};

// ============================================================================
// Exports for testing/usage
// ============================================================================

module.exports = {
  // Handlers
  appendHandler,
  treeHeadHandler,
  proofHandler,
  consistencyHandler,
  entriesHandler,

  // Functions
  verifyClosePackInLog,
  batchAppend,

  // Classes
  ClosePackService,
  TransparencyMonitor,

  // Worker
  worker
};
