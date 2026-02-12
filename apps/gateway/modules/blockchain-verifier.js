/**
 * Blockchain Verifier - Gap #4 Solution
 * =======================================
 *
 * COMMITTEE-APPROVED ARCHITECTURE:
 * - Background worker verifies anchors every 5 minutes
 * - Results cached in database
 * - API endpoint = instant lookup (no blockchain in request path)
 * - Meets standards of: Slootman, Collison, Plaid, Jobs
 *
 * RPC PROVIDER STRATEGY:
 * - Primary: Infura (most reliable)
 * - Fallback 1: Alchemy (fast)
 * - Fallback 2: QuickNode (backup)
 * - Automatic failover on errors
 *
 * VERIFICATION CRITERIA:
 * - Transaction must exist on blockchain
 * - Must have minimum confirmations (6 for mainnet, 2 for testnet)
 * - Transaction data must match anchor payload hash
 * - Block number must match stored block number
 */

const { ethers } = require('ethers');

class BlockchainVerifier {
  constructor(supabaseClient, env = {}) {
    this.supabase = supabaseClient;
    this.env = env;

    // DEBUG: Log what keys are available in env
    console.log('[VERIFIER DEBUG] env keys:', Object.keys(env));
    console.log('[VERIFIER DEBUG] INFURA_API_KEY exists:', !!env.INFURA_API_KEY);
    console.log('[VERIFIER DEBUG] ALCHEMY_API_KEY exists:', !!env.ALCHEMY_API_KEY);

    // RPC provider configuration (ordered by preference)
    // Uses environment variables set via: wrangler secret put INFURA_API_KEY
    this.rpcProviders = [
      {
        name: 'infura',
        sepolia: env.INFURA_API_KEY ? `https://sepolia.infura.io/v3/${env.INFURA_API_KEY}` : null,
        mainnet: env.INFURA_API_KEY ? `https://mainnet.infura.io/v3/${env.INFURA_API_KEY}` : null
      },
      {
        name: 'alchemy',
        sepolia: env.ALCHEMY_API_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : null,
        mainnet: env.ALCHEMY_API_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}` : null
      },
      {
        name: 'quicknode',
        sepolia: env.QUICKNODE_SEPOLIA_URL || null,
        mainnet: env.QUICKNODE_MAINNET_URL || null
      }
    ];

    // DEBUG: Log constructed providers
    console.log('[VERIFIER DEBUG] rpcProviders:', JSON.stringify(this.rpcProviders, null, 2));

    // Minimum confirmations required
    this.MIN_CONFIRMATIONS = {
      sepolia: 2,    // Testnet: 2 confirmations (~30 seconds)
      mainnet: 6,    // Mainnet: 6 confirmations (~90 seconds)
      ethereum: 6    // Alias for mainnet
    };
  }

  /**
   * Normalize network names to match provider keys
   */
  normalizeNetwork(network) {
    const mapping = {
      'ethereum-sepolia': 'sepolia',
      'eth-sepolia': 'sepolia',
      'ethereum-mainnet': 'mainnet',
      'eth-mainnet': 'mainnet',
      'ethereum': 'mainnet'
    };
    return mapping[network] || network;
  }

  /**
   * Get provider with failover
   * Tries each RPC provider in order until one succeeds
   */
  async getProvider(network) {
    const errors = [];
    const normalizedNetwork = this.normalizeNetwork(network);
    console.log(`[VERIFIER DEBUG] Normalized "${network}" → "${normalizedNetwork}"`);

    for (const provider of this.rpcProviders) {
      try {
        const rpcUrl = provider[normalizedNetwork];
        if (!rpcUrl) {
          // Skip unconfigured providers
          continue;
        }

        const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);

        // Test connection with timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('RPC timeout')), 5000)
        );

        await Promise.race([
          ethersProvider.getBlockNumber(),
          timeoutPromise
        ]);

        console.log(`[VERIFIER] Connected to ${provider.name} for ${normalizedNetwork} (original: ${network})`);
        return { provider: ethersProvider, name: provider.name };
      } catch (error) {
        errors.push({ provider: provider.name, error: error.message });
        console.warn(`[VERIFIER] ${provider.name} failed: ${error.message}`);
      }
    }

    throw new Error(`All RPC providers failed: ${JSON.stringify(errors)}`);
  }

  /**
   * Verify a single anchor on blockchain
   * Returns verification result with detailed status
   */
  async verifySingleAnchor(anchor) {
    const startTime = Date.now();

    try {
      console.log(`[VERIFIER] Verifying anchor ${anchor.anchor_id} (tx: ${anchor.tx_hash})`);
      console.log(`[VERIFIER DEBUG] anchor.network = "${anchor.network}"`);

      // Get provider with failover
      const { provider, name: rpcProvider } = await this.getProvider(anchor.network);

      // Fetch transaction from blockchain
      const tx = await provider.getTransaction(anchor.tx_hash);
      console.log(`[VERIFIER DEBUG] tx found:`, !!tx);

      if (!tx) {
        console.log(`[VERIFIER DEBUG] ❌ Transaction not found`);
        return {
          verified: false,
          error: 'Transaction not found on blockchain',
          rpcProvider,
          duration: Date.now() - startTime
        };
      }

      // Check if transaction is confirmed
      const currentBlock = await provider.getBlockNumber();
      const confirmations = tx.blockNumber ? currentBlock - tx.blockNumber + 1 : 0;

      const normalizedNetwork = this.normalizeNetwork(anchor.network);
      const minConfirmations = this.MIN_CONFIRMATIONS[normalizedNetwork] || 6;
      console.log(`[VERIFIER DEBUG] Confirmations: ${confirmations}/${minConfirmations}`);

      if (confirmations < minConfirmations) {
        console.log(`[VERIFIER DEBUG] ❌ Insufficient confirmations`);
        return {
          verified: false,
          error: `Insufficient confirmations: ${confirmations}/${minConfirmations}`,
          confirmations,
          rpcProvider,
          duration: Date.now() - startTime
        };
      }
      console.log(`[VERIFIER DEBUG] ✅ Confirmations OK`);

      // Verify block number matches
      console.log(`[VERIFIER DEBUG] Block: anchor=${anchor.block_number}, tx=${tx.blockNumber}`);
      if (anchor.block_number && tx.blockNumber !== anchor.block_number) {
        console.log(`[VERIFIER DEBUG] ❌ Block number mismatch`);
        return {
          verified: false,
          error: `Block number mismatch: expected ${anchor.block_number}, got ${tx.blockNumber}`,
          confirmations,
          rpcProvider,
          duration: Date.now() - startTime
        };
      }
      console.log(`[VERIFIER DEBUG] ✅ Block number OK`);

      // Verify transaction data contains anchor payload hash
      // The hash should be in the transaction input data
      const txData = tx.data || '0x';
      const payloadHash = anchor.anchor_payload_sha256;

      // Remove '0x' prefix for comparison
      const normalizedTxData = txData.toLowerCase().replace('0x', '');
      const normalizedPayloadHash = payloadHash.toLowerCase().replace('0x', '');

      console.log(`[VERIFIER DEBUG] Checking payload hash in tx data...`);
      console.log(`[VERIFIER DEBUG] tx.data length: ${normalizedTxData.length}`);
      console.log(`[VERIFIER DEBUG] payload hash: ${normalizedPayloadHash}`);
      console.log(`[VERIFIER DEBUG] hash in data: ${normalizedTxData.includes(normalizedPayloadHash)}`);

      if (!normalizedTxData.includes(normalizedPayloadHash)) {
        console.log(`[VERIFIER DEBUG] ❌ Payload hash not found in tx data`);
        return {
          verified: false,
          error: 'Payload hash not found in transaction data',
          confirmations,
          rpcProvider,
          duration: Date.now() - startTime
        };
      }
      console.log(`[VERIFIER DEBUG] ✅ Payload hash found!`);

      // All checks passed!
      console.log(`[VERIFIER] ✓ Anchor ${anchor.anchor_id} verified in ${Date.now() - startTime}ms`);

      return {
        verified: true,
        confirmations,
        rpcProvider,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        duration: Date.now() - startTime
      };

    } catch (error) {
      console.error(`[VERIFIER] Error verifying anchor ${anchor.anchor_id}:`, error);

      return {
        verified: false,
        error: error.message || 'Unknown verification error',
        rpcProvider: 'unknown',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Update anchor verification status in database
   */
  async updateAnchorVerification(anchorId, result) {
    const updateData = {
      verified: result.verified,
      verified_at: new Date().toISOString(),
      verification_error: result.error || null,
      confirmations_at_verification: result.confirmations || null,
      rpc_provider: result.rpcProvider || null
    };

    const { error } = await this.supabase
      .from('anchors')
      .update(updateData)
      .eq('anchor_id', anchorId);

    if (error) {
      console.error(`[VERIFIER] Failed to update anchor ${anchorId}:`, error);
      throw error;
    }

    console.log(`[VERIFIER] Updated anchor ${anchorId}: verified=${result.verified}`);
  }

  /**
   * Main verification loop
   * Called by scheduled worker every 5 minutes
   */
  async runVerificationCycle(options = {}) {
    const batchSize = options.batchSize || 50;
    const maxRuntime = options.maxRuntime || 4 * 60 * 1000; // 4 minutes (leave 1 min buffer)
    const startTime = Date.now();

    console.log(`[VERIFIER] Starting verification cycle (batch size: ${batchSize})`);

    try {
      // Fetch unverified anchors (prioritize oldest first)
      const { data: anchors, error: fetchError } = await this.supabase
        .from('anchors')
        .select('anchor_id, tx_hash, network, block_number, anchor_payload_sha256, created_at')
        .or('verified.is.null,verified.eq.false')
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (fetchError) {
        console.error('[VERIFIER] Failed to fetch anchors:', fetchError);
        return { success: false, error: fetchError.message };
      }

      if (!anchors || anchors.length === 0) {
        console.log('[VERIFIER] No anchors to verify');
        return { success: true, verified: 0, failed: 0, skipped: 0 };
      }

      console.log(`[VERIFIER] Found ${anchors.length} anchors to verify`);

      // Verify each anchor
      let verified = 0;
      let failed = 0;
      let skipped = 0;

      for (const anchor of anchors) {
        // Check if we're running out of time
        if (Date.now() - startTime > maxRuntime) {
          console.warn(`[VERIFIER] Approaching timeout, stopping after ${verified + failed} anchors`);
          skipped = anchors.length - (verified + failed);
          break;
        }

        try {
          const result = await this.verifySingleAnchor(anchor);
          await this.updateAnchorVerification(anchor.anchor_id, result);

          if (result.verified) {
            verified++;
          } else {
            failed++;
          }

        } catch (error) {
          console.error(`[VERIFIER] Failed to process anchor ${anchor.anchor_id}:`, error);
          failed++;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[VERIFIER] Cycle complete in ${duration}ms: ${verified} verified, ${failed} failed, ${skipped} skipped`);

      return {
        success: true,
        verified,
        failed,
        skipped,
        duration,
        totalProcessed: verified + failed
      };

    } catch (error) {
      console.error('[VERIFIER] Verification cycle failed:', error);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Force refresh verification for specific anchor
   * Used by /verify/{hash}/refresh endpoint
   */
  async refreshVerification(payloadHash) {
    console.log(`[VERIFIER] Force refresh for hash: ${payloadHash}`);

    // Fetch anchor by payload hash
    const { data: anchors, error: fetchError } = await this.supabase
      .from('anchors')
      .select('*')
      .eq('anchor_payload_sha256', payloadHash)
      .limit(1);

    if (fetchError) {
      throw new Error(`Failed to fetch anchor: ${fetchError.message}`);
    }

    if (!anchors || anchors.length === 0) {
      throw new Error('Anchor not found');
    }

    const anchor = anchors[0];

    // Verify and update
    const result = await this.verifySingleAnchor(anchor);
    await this.updateAnchorVerification(anchor.anchor_id, result);

    return {
      anchorId: anchor.anchor_id,
      verified: result.verified,
      confirmations: result.confirmations,
      error: result.error,
      rpcProvider: result.rpcProvider,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Get verification statistics
   * Used by monitoring dashboard
   */
  async getVerificationStats() {
    const { data, error } = await this.supabase
      .rpc('get_verification_stats');

    if (error) {
      // Fallback to manual query if RPC function doesn't exist
      const { data: anchors } = await this.supabase
        .from('anchors')
        .select('verified, verification_error');

      if (!anchors) return null;

      return {
        total: anchors.length,
        verified: anchors.filter(a => a.verified === true).length,
        failed: anchors.filter(a => a.verified === false).length,
        pending: anchors.filter(a => a.verified === null).length
      };
    }

    return data;
  }
}

// Export for CommonJS
module.exports = { BlockchainVerifier };
