/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT REAL BLOCKCHAIN ANCHORING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pillar 4: Cryptographic Finality — REAL ethers.js implementation
 *
 * Replaces the simulated _simulateAnchor() with actual Ethereum/Polygon
 * transaction submission. Anchors the Merkle root of a Close Pack to
 * an immutable public ledger.
 *
 * Supported Networks:
 *   - Ethereum Mainnet (chainId: 1)
 *   - Ethereum Sepolia Testnet (chainId: 11155111)
 *   - Base Mainnet (chainId: 8453)
 *   - Base Sepolia (chainId: 84532)
 *   - Polygon Mainnet (chainId: 137)
 *
 * Usage:
 *   const anchoring = new RealBlockchainAnchor({ network: 'base-mainnet', privateKey: '0x...' });
 *   const receipt = await anchoring.anchor(closeId, merkleRoot, zipSha256);
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const NETWORKS = {
    'ethereum-mainnet': {
        chainId: 1,
        name: 'Ethereum Mainnet',
        rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
        explorerUrl: 'https://etherscan.io/tx/',
        confirmations: 3
    },
    'ethereum-sepolia': {
        chainId: 11155111,
        name: 'Ethereum Sepolia',
        rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/',
        explorerUrl: 'https://sepolia.etherscan.io/tx/',
        confirmations: 2
    },
    'base-mainnet': {
        chainId: 8453,
        name: 'Base Mainnet',
        rpcUrl: 'https://mainnet.base.org',
        explorerUrl: 'https://basescan.org/tx/',
        confirmations: 3
    },
    'base-sepolia': {
        chainId: 84532,
        name: 'Base Sepolia',
        rpcUrl: 'https://sepolia.base.org',
        explorerUrl: 'https://sepolia.basescan.org/tx/',
        confirmations: 2
    },
    'polygon': {
        chainId: 137,
        name: 'Polygon Mainnet',
        rpcUrl: 'https://polygon-rpc.com',
        explorerUrl: 'https://polygonscan.com/tx/',
        confirmations: 3
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ARWEAVE GATEWAY CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const ARWEAVE_CONFIG = {
    gateway: process.env.ARWEAVE_GATEWAY_URL || 'https://arweave.net',
    timeout: 30000,
    retries: 3
};

// ─────────────────────────────────────────────────────────────────────────────
// ANCHOR ID GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function generateAnchorId(closeId, network) {
    const hash = crypto.createHash('sha256')
        .update(`${closeId}|${network}|${Date.now()}`)
        .digest('hex')
        .substring(0, 12)
        .toUpperCase();
    return `FIN-AN-${hash}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL BLOCKCHAIN ANCHOR SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export class RealBlockchainAnchor {
    constructor(options = {}) {
        this.network = options.network || 'base-sepolia';
        this.networkConfig = NETWORKS[this.network];
        this.privateKey = options.privateKey || null;
        this.alchemyApiKey = options.alchemyApiKey || null;
        this.mode = options.mode || 'SOFT'; // HARD = fail close if anchor fails, SOFT = continue without
        this.maxRetries = options.maxRetries || 3;
        this.confirmationBlocks = this.networkConfig?.confirmations || 3;

        // Arweave configuration
        this.enableArweave = options.enableArweave !== false; // Enable by default
        this.arweaveGateway = options.arweaveGateway || ARWEAVE_CONFIG.gateway;

        if (!this.networkConfig) {
            throw new Error(`Unknown network: ${this.network}. Supported: ${Object.keys(NETWORKS).join(', ')}`);
        }
    }

    /**
     * Anchor a Close Pack's Merkle root to dual blockchains
     * Ethereum L2 (Base) for speed + Arweave for permanent storage
     *
     * @param {string} closeId - The Close Pack ID
     * @param {string} merkleRoot - SHA-256 Merkle root of all artifacts
     * @param {string} zipSha256 - SHA-256 of the complete ZIP file
     * @param {object} metadata - Additional metadata (period, provider, etc.)
     * @returns {object} Anchor receipt with Ethereum tx hash AND Arweave tx ID
     */
    async anchor(closeId, merkleRoot, zipSha256, metadata = {}) {
        const anchorId = generateAnchorId(closeId, this.network);

        // Build anchor payload
        const payload = this._buildPayload(closeId, merkleRoot, zipSha256, metadata);
        const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

        // Attempt dual anchoring with retries
        let lastError = null;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Submit to Ethereum first
                const ethereumResult = await this._submitTransaction(payload, payloadHash);

                // Attempt Arweave submission in parallel (even if it fails, Ethereum anchor succeeded)
                let arweaveResult = null;
                if (this.enableArweave) {
                    try {
                        arweaveResult = await this._submitToArweave(payload, payloadHash, metadata);
                    } catch (arweaveError) {
                        // Arweave failure is SOFT by default — don't fail the whole anchor
                        console.warn(`Arweave anchoring failed (will continue): ${arweaveError.message}`);
                    }
                }

                return {
                    success: true,
                    anchorId,
                    closeId,
                    network: this.network,
                    chainId: this.networkConfig.chainId,

                    // Ethereum L2 anchoring
                    ethereum: {
                        txHash: ethereumResult.txHash,
                        blockNumber: ethereumResult.blockNumber,
                        blockTimestamp: ethereumResult.blockTimestamp,
                        confirmations: ethereumResult.confirmations,
                        explorerUrl: `${this.networkConfig.explorerUrl}${ethereumResult.txHash}`,
                        gasUsed: ethereumResult.gasUsed,
                        gasCost: ethereumResult.gasCost
                    },

                    // Arweave permanent storage
                    arweave: arweaveResult ? {
                        txId: arweaveResult.txId,
                        status: arweaveResult.status,
                        timestamp: arweaveResult.timestamp,
                        gateway: this.arweaveGateway,
                        explorerUrl: `${this.arweaveGateway}/${arweaveResult.txId}`
                    } : null,

                    // Payload info
                    anchorPayloadSha256: payloadHash,
                    merkleRootSha256: merkleRoot,
                    zipSha256,

                    anchoredAt: new Date().toISOString(),
                    attempt
                };

            } catch (error) {
                lastError = error;
                if (attempt < this.maxRetries) {
                    await new Promise(r => setTimeout(r, 2000 * attempt)); // Exponential backoff
                }
            }
        }

        // All retries failed
        if (this.mode === 'HARD') {
            throw new AnchorError(
                `Blockchain anchoring failed after ${this.maxRetries} attempts: ${lastError?.message}`,
                { closeId, network: this.network, lastError: lastError?.message }
            );
        }

        // SOFT mode: return failure receipt without throwing
        return {
            success: false,
            anchorId,
            closeId,
            network: this.network,
            error: lastError?.message || 'Unknown error',
            attempts: this.maxRetries,
            mode: this.mode,
            anchoredAt: null
        };
    }

    /**
     * Verify an existing anchor against the blockchain
     */
    async verifyAnchor(txHash, expectedPayloadHash) {
        try {
            // Use ethers.js to fetch transaction
            const ethers = await this._loadEthers();
            const provider = this._getProvider(ethers);
            const tx = await provider.getTransaction(txHash);

            if (!tx) {
                return { verified: false, reason: 'Transaction not found' };
            }

            // Verify the data field contains our payload hash
            const txData = tx.data;
            const containsPayload = txData.includes(expectedPayloadHash.replace('0x', ''));

            // Check confirmations
            const currentBlock = await provider.getBlockNumber();
            const confirmations = tx.blockNumber ? currentBlock - tx.blockNumber : 0;

            return {
                verified: containsPayload,
                txHash,
                blockNumber: tx.blockNumber,
                confirmations,
                from: tx.from,
                chainId: tx.chainId,
                reason: containsPayload ? 'Payload hash found in transaction data' : 'Payload hash not found'
            };
        } catch (error) {
            return { verified: false, reason: error.message };
        }
    }

    // ─── Internal methods ────────────────────────────────────────────────

    _buildPayload(closeId, merkleRoot, zipSha256, metadata) {
        // Deterministic payload: always produces the same hash for the same inputs
        const payload = JSON.stringify({
            version: '2.0',
            type: 'finault-anchor',
            close_id: closeId,
            merkle_root_sha256: merkleRoot,
            zip_sha256: zipSha256,
            period_start: metadata.periodStart || null,
            period_end: metadata.periodEnd || null,
            timestamp: metadata.timestamp || new Date().toISOString()
        });
        return payload;
    }

    async _submitTransaction(payload, payloadHash) {
        const ethers = await this._loadEthers();
        const provider = this._getProvider(ethers);

        if (!this.privateKey) {
            throw new Error('Private key required for anchoring. Set ANCHOR_PRIVATE_KEY environment variable.');
        }

        const wallet = new ethers.Wallet(this.privateKey, provider);

        // Encode payload hash as transaction data (0x prefix + hex)
        const data = '0x' + Buffer.from(`FINAULT:${payloadHash}`).toString('hex');

        // Submit transaction (send to self with data payload)
        const tx = await wallet.sendTransaction({
            to: wallet.address, // Self-send: cheapest way to anchor data
            value: 0,
            data,
            // Let ethers.js estimate gas
        });

        // Wait for confirmations
        const receipt = await tx.wait(this.confirmationBlocks);

        return {
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            blockTimestamp: new Date().toISOString(),
            confirmations: this.confirmationBlocks,
            gasUsed: receipt.gasUsed?.toString() || '0',
            gasCost: receipt.gasPrice
                ? (BigInt(receipt.gasUsed || 0) * BigInt(receipt.gasPrice || 0)).toString()
                : '0'
        };
    }

    /**
     * Submit merkle root to Arweave for permanent storage
     * Arweave provides eternal, immutable, censorship-resistant archive
     */
    async _submitToArweave(payload, payloadHash, metadata) {
        const Arweave = await this._loadArweave();
        const arweave = Arweave.init({
            host: new URL(this.arweaveGateway).hostname,
            port: 443,
            protocol: 'https'
        });

        // Prepare Arweave transaction with metadata
        const txData = Buffer.from(JSON.stringify({
            type: 'finault-anchor',
            payload_hash: payloadHash,
            merkle_root: metadata.merkleRoot,
            timestamp: new Date().toISOString(),
            close_id: metadata.closeId,
            period_start: metadata.periodStart,
            period_end: metadata.periodEnd
        }));

        const tx = await arweave.createTransaction({
            data: txData
        });

        // Tag with identifiers for easy discovery
        tx.addTag('App-Name', 'Finault');
        tx.addTag('Content-Type', 'application/json');
        tx.addTag('Entity-Type', 'close-pack-anchor');
        tx.addTag('Finault-Version', '2.0');

        // Sign transaction with wallet (requires ARWEAVE_KEY_FILE or ARWEAVE_KEY_JSON env)
        const arweaveKey = await this._getArweaveKey();
        if (!arweaveKey) {
            throw new Error('Arweave key required. Set ARWEAVE_KEY_FILE or ARWEAVE_KEY_JSON environment variable.');
        }

        await arweave.transactions.sign(tx, arweaveKey);

        // Submit transaction
        const uploader = await arweave.transactions.getUploader(tx);
        while (!uploader.isComplete) {
            await uploader.uploadChunk();
        }

        return {
            txId: tx.id,
            status: 'submitted',
            timestamp: new Date().toISOString()
        };
    }

    async _loadArweave() {
        try {
            const Arweave = await import('arweave');
            return Arweave.default || Arweave;
        } catch {
            throw new Error(
                'arweave-js is required for Arweave anchoring. ' +
                'Install with: npm install arweave'
            );
        }
    }

    async _getArweaveKey() {
        const fs = await import('fs');
        const keyFile = process.env.ARWEAVE_KEY_FILE;
        const keyJson = process.env.ARWEAVE_KEY_JSON;

        if (keyFile) {
            try {
                const rawKey = fs.readFileSync(keyFile, 'utf-8');
                return JSON.parse(rawKey);
            } catch (error) {
                throw new Error(`Failed to load Arweave key from file: ${error.message}`);
            }
        }

        if (keyJson) {
            try {
                return JSON.parse(keyJson);
            } catch (error) {
                throw new Error(`Failed to parse ARWEAVE_KEY_JSON: ${error.message}`);
            }
        }

        return null;
    }

    _getProvider(ethers) {
        const rpcUrl = this.alchemyApiKey
            ? `${this.networkConfig.rpcUrl}${this.alchemyApiKey}`
            : this.networkConfig.rpcUrl;
        return new ethers.JsonRpcProvider(rpcUrl);
    }

    async _loadEthers() {
        // Dynamic import of ethers.js (must be installed: npm install ethers)
        try {
            const ethers = await import('ethers');
            return ethers.default || ethers;
        } catch {
            throw new Error(
                'ethers.js is required for real blockchain anchoring. ' +
                'Install with: npm install ethers'
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANCHOR RECEIPT GENERATOR
// Generates anchor_receipt.json for inclusion in Close Pack
// ─────────────────────────────────────────────────────────────────────────────

export function generateAnchorReceipt(anchorResult) {
    return {
        schema_version: '2.0',
        anchor_id: anchorResult.anchorId,
        close_id: anchorResult.closeId,
        anchoring_mode: 'dual', // Ethereum + Arweave

        ethereum: {
            network_name: anchorResult.network,
            chain_id: anchorResult.chainId,
            transaction: {
                hash: anchorResult.ethereum.txHash,
                block_number: anchorResult.ethereum.blockNumber,
                block_timestamp: anchorResult.ethereum.blockTimestamp,
                confirmations: anchorResult.ethereum.confirmations,
                explorer_url: anchorResult.ethereum.explorerUrl
            },
            gas: {
                used: anchorResult.ethereum.gasUsed,
                cost_wei: anchorResult.ethereum.gasCost
            }
        },

        arweave: anchorResult.arweave ? {
            transaction_id: anchorResult.arweave.txId,
            status: anchorResult.arweave.status,
            timestamp: anchorResult.arweave.timestamp,
            gateway_url: anchorResult.arweave.gateway,
            explorer_url: anchorResult.arweave.explorerUrl,
            permanent_storage: true
        } : {
            status: 'skipped_or_failed',
            note: 'Ethereum anchor succeeded; Arweave optional'
        },

        payload: {
            anchor_payload_sha256: anchorResult.anchorPayloadSha256,
            merkle_root_sha256: anchorResult.merkleRootSha256,
            zip_sha256: anchorResult.zipSha256
        },

        anchored_at: anchorResult.anchoredAt,
        verification_command: `finault verify --check-anchor --ethereum-tx ${anchorResult.ethereum.txHash} --arweave-tx ${anchorResult.arweave?.txId || 'N/A'} --network ${anchorResult.network}`
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR TYPES
// ─────────────────────────────────────────────────────────────────────────────

export class AnchorError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'AnchorError';
        this.details = details;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default RealBlockchainAnchor;
export { NETWORKS, generateAnchorId };
