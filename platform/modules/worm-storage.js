/**
 * WORM Storage Module for Finault Platform
 * Implements dual-write immutability strategy for close packs
 * Primary: R2 (Cloudflare) - fast path
 * Secondary: S3 Object Lock (AWS) - compliance-grade WORM
 *
 * CommonJS (Node.js/Workers compatible)
 * AWS Signature V4 signing implemented without aws-sdk dependency
 */

/**
 * WORM configuration
 * @type {{retentionDays: number, retentionMode: string, hashAlgorithm: string, provider: {primary: string, secondary: string}}}
 */
const WORM_CONFIG = {
  retentionDays: 2555,
  retentionMode: 'COMPLIANCE',
  hashAlgorithm: 'SHA-256',
  provider: {
    primary: 'r2',
    secondary: 's3'
  }
};

/**
 * WORMStorage class implements dual-write immutability
 */
class WORMStorage {
  /**
   * Initialize WORM storage with environment configuration
   * @param {object} env - Environment object containing:
   *   - CLOSEPACKS: R2 binding
   *   - AWS_ACCESS_KEY_ID: AWS credentials (optional)
   *   - AWS_SECRET_ACCESS_KEY: AWS credentials (optional)
   *   - AWS_S3_BUCKET: S3 bucket name (optional)
   *   - AWS_REGION: AWS region (optional, defaults to us-east-1)
   */
  constructor(env) {
    this.env = env;
    this.r2 = env.CLOSEPACKS;
    this.s3Enabled = !!(
      env.AWS_ACCESS_KEY_ID &&
      env.AWS_SECRET_ACCESS_KEY &&
      env.AWS_S3_BUCKET
    );
    this.awsConfig = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      bucket: env.AWS_S3_BUCKET,
      region: env.AWS_REGION || 'us-east-1'
    };
  }

  /**
   * Compute SHA-256 hash of buffer
   * @param {ArrayBuffer} buffer - Data buffer to hash
   * @returns {Promise<string>} - Hex-encoded SHA-256 hash
   * @private
   */
  async _computeSHA256(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Compute MD5 hash for S3 Content-MD5 header
   * Uses SHA-256 as fallback since MD5 is deprecated
   * @param {ArrayBuffer} buffer - Data buffer
   * @returns {Promise<string>} - Base64-encoded hash
   * @private
   */
  async _computeContentHash(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
    return base64;
  }

  /**
   * Build canonical request for AWS Signature V4
   * @param {string} method - HTTP method (PUT, GET, etc.)
   * @param {string} path - Request path
   * @param {object} headers - Request headers
   * @returns {string} - Canonical request string
   * @private
   */
  _buildCanonicalRequest(method, path, headers) {
    const lines = [
      method,
      path,
      '', // query string (empty for our use case)
    ];

    // Sort headers
    const sortedHeaders = {};
    for (const key of Object.keys(headers).sort()) {
      sortedHeaders[key.toLowerCase()] = headers[key];
    }

    // Canonical headers
    for (const key of Object.keys(sortedHeaders)) {
      lines.push(`${key}:${sortedHeaders[key]}`);
    }
    lines.push(''); // blank line

    // Signed headers
    const signedHeadersList = Object.keys(sortedHeaders).join(';');
    lines.push(signedHeadersList);

    // Payload hash (already included in headers as x-amz-content-sha256)
    const payloadHash = sortedHeaders['x-amz-content-sha256'] || 'UNSIGNED-PAYLOAD';
    lines.push(payloadHash);

    return lines.join('\n');
  }

  /**
   * Sign request with AWS Signature V4
   * @param {string} method - HTTP method
   * @param {string} host - S3 host
   * @param {string} path - Request path
   * @param {object} headers - Request headers (will be modified)
   * @param {string} payloadHash - SHA-256 hash of payload
   * @param {string} timestamp - ISO timestamp
   * @returns {Promise<object>} - Updated headers with authorization
   * @private
   */
  async _signRequest(method, host, path, headers, payloadHash, timestamp) {
    const isoDate = timestamp.split('T')[0].replace(/-/g, '');
    const credentialScope = `${isoDate}/${this.awsConfig.region}/s3/aws4_request`;

    // Add required headers
    headers['host'] = host;
    headers['x-amz-date'] = timestamp;
    headers['x-amz-content-sha256'] = payloadHash;

    const canonicalRequest = this._buildCanonicalRequest(method, path, headers);

    // Create string to sign
    const canonicalRequestHash = await this._computeSHA256(
      new TextEncoder().encode(canonicalRequest)
    );

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      canonicalRequestHash
    ].join('\n');

    // Sign using HMAC-SHA256
    const kDate = await this._hmacSHA256(
      `AWS4${this.awsConfig.secretAccessKey}`,
      isoDate
    );
    const kRegion = await this._hmacSHA256(kDate, this.awsConfig.region);
    const kService = await this._hmacSHA256(kRegion, 's3');
    const kSigning = await this._hmacSHA256(kService, 'aws4_request');
    const signature = await this._hmacSHA256(kSigning, stringToSign, true);

    const signedHeaders = Object.keys(headers)
      .map(k => k.toLowerCase())
      .sort()
      .join(';');

    headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${this.awsConfig.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return headers;
  }

  /**
   * HMAC-SHA256 helper
   * @param {string|ArrayBuffer} key - HMAC key
   * @param {string} message - Message to sign
   * @param {boolean} hexOutput - Return hex string instead of buffer
   * @returns {Promise<ArrayBuffer|string>} - HMAC signature
   * @private
   */
  async _hmacSHA256(key, message, hexOutput = false) {
    const keyBuffer = typeof key === 'string'
      ? new TextEncoder().encode(key)
      : key;

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(message)
    );

    if (hexOutput) {
      return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    return signature;
  }

  /**
   * Store close pack with WORM protection
   * Writes to R2 (fast path) and optionally S3 with Object Lock (compliance)
   * @param {string} closeId - Close pack identifier
   * @param {ArrayBuffer} zipBuffer - Zipped close pack data
   * @param {string} attestationHash - Expected SHA-256 hash for verification
   * @returns {Promise<object>} - Storage result with R2 and S3 status
   */
  async storeWithWORM(closeId, zipBuffer, attestationHash) {
    const result = {
      r2: { success: false, key: null, hash: null },
      s3: null,
      wormStatus: 'failed'
    };

    try {
      // Compute SHA-256 of close pack
      const computedHash = await this._computeSHA256(zipBuffer);

      // Verify hash matches attestation
      if (computedHash !== attestationHash) {
        throw new Error(
          `Hash mismatch: computed ${computedHash} vs attested ${attestationHash}`
        );
      }

      const r2Key = `closepacks/${closeId}.zip`;

      // Write to R2 (primary fast path)
      try {
        await this.r2.put(r2Key, zipBuffer, {
          customMetadata: {
            'worm-hash': computedHash,
            'worm-mode': WORM_CONFIG.retentionMode,
            'worm-retention-days': String(WORM_CONFIG.retentionDays),
            'stored-at': new Date().toISOString()
          }
        });

        result.r2 = {
          success: true,
          key: r2Key,
          hash: computedHash
        };
      } catch (r2Error) {
        console.error('[WORM] R2 write failed:', r2Error.message);
        throw new Error(`R2 write failed: ${r2Error.message}`);
      }

      // Write to S3 with Object Lock (secondary, non-fatal)
      if (this.s3Enabled) {
        result.s3 = await this._writeToS3WithLock(closeId, zipBuffer, computedHash);
        result.wormStatus = result.s3.success ? 'full' : 'r2_only';
      } else {
        result.wormStatus = 'r2_only';
      }

      return result;
    } catch (error) {
      console.error('[WORM] Storage failed:', error.message);
      result.wormStatus = 'failed';
      throw error;
    }
  }

  /**
   * Write to S3 with Object Lock (non-fatal, soft mode)
   * Failures logged but don't crash the close pack flow
   * @param {string} closeId - Close pack identifier
   * @param {ArrayBuffer} zipBuffer - Zipped data
   * @param {string} hash - Computed SHA-256 hash
   * @returns {Promise<object>} - S3 write result
   * @private
   */
  async _writeToS3WithLock(closeId, zipBuffer, hash) {
    const s3Result = {
      success: false,
      key: null,
      lockMode: null,
      retainUntil: null
    };

    try {
      const key = `closepacks/${closeId}.zip`;
      const timestamp = new Date().toISOString();
      const retainUntilDate = new Date(
        Date.now() + WORM_CONFIG.retentionDays * 24 * 60 * 60 * 1000
      ).toISOString();

      // Compute content hash for integrity
      const contentHash = await this._computeContentHash(zipBuffer);
      const payloadHash = await this._computeSHA256(zipBuffer);

      // Build S3 request
      const host = `${this.awsConfig.bucket}.s3.${this.awsConfig.region}.amazonaws.com`;
      const path = `/${key}`;

      const headers = {
        'content-type': 'application/zip',
        'content-md5': contentHash,
        'x-amz-object-lock-mode': WORM_CONFIG.retentionMode,
        'x-amz-object-lock-retain-until-date': retainUntilDate
      };

      // Sign the request
      const signedHeaders = await this._signRequest(
        'PUT',
        host,
        path,
        headers,
        payloadHash,
        timestamp
      );

      // Execute PUT request
      const s3Response = await fetch(`https://${host}${path}`, {
        method: 'PUT',
        headers: signedHeaders,
        body: zipBuffer
      });

      if (!s3Response.ok) {
        const errorText = await s3Response.text();
        throw new Error(
          `S3 PutObject failed: ${s3Response.status} ${errorText}`
        );
      }

      s3Result.success = true;
      s3Result.key = key;
      s3Result.lockMode = WORM_CONFIG.retentionMode;
      s3Result.retainUntil = retainUntilDate;

      console.log(
        `[WORM] S3 write successful: ${key} with ${WORM_CONFIG.retentionMode} lock until ${retainUntilDate}`
      );
    } catch (error) {
      console.error('[WORM] S3 write failed (non-fatal):', error.message);
      // Graceful degradation - don't throw, just log
    }

    return s3Result;
  }

  /**
   * Verify immutability of stored close pack
   * Reads from R2, computes hash, checks S3 Object Lock status
   * @param {string} closeId - Close pack identifier
   * @param {string} expectedHash - Expected SHA-256 hash
   * @returns {Promise<object>} - Verification result
   */
  async verifyImmutability(closeId, expectedHash) {
    const timestamp = new Date().toISOString();
    const result = {
      verified: false,
      r2: { exists: false, hashMatch: false, hash: null },
      s3: null,
      timestamp
    };

    try {
      const r2Key = `closepacks/${closeId}.zip`;

      // Read and verify from R2
      const r2Object = await this.r2.get(r2Key);
      if (!r2Object) {
        console.warn(`[WORM] R2 object not found: ${r2Key}`);
        return result;
      }

      const r2Buffer = await r2Object.arrayBuffer();
      const computedHash = await this._computeSHA256(r2Buffer);

      result.r2 = {
        exists: true,
        hash: computedHash,
        hashMatch: computedHash === expectedHash
      };

      // Check S3 Object Lock status
      if (this.s3Enabled) {
        result.s3 = await this._checkS3ObjectLock(closeId);
      }

      result.verified = result.r2.hashMatch && (
        !this.s3Enabled || (result.s3 && result.s3.lockActive)
      );

      return result;
    } catch (error) {
      console.error('[WORM] Verification failed:', error.message);
      return result;
    }
  }

  /**
   * Check S3 Object Lock status
   * @param {string} closeId - Close pack identifier
   * @returns {Promise<object>} - Lock status
   * @private
   */
  async _checkS3ObjectLock(closeId) {
    const lockResult = {
      exists: false,
      lockActive: false,
      retainUntil: null,
      lockMode: null
    };

    try {
      const key = `closepacks/${closeId}.zip`;
      const timestamp = new Date().toISOString();
      const host = `${this.awsConfig.bucket}.s3.${this.awsConfig.region}.amazonaws.com`;
      const path = `/${key}?retention`;

      const headers = {};
      const signedHeaders = await this._signRequest(
        'GET',
        host,
        path,
        headers,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA-256 of empty string
        timestamp
      );

      const s3Response = await fetch(`https://${host}${path}`, {
        method: 'GET',
        headers: signedHeaders
      });

      if (s3Response.status === 404) {
        console.warn(`[WORM] S3 object not found: ${key}`);
        return lockResult;
      }

      if (!s3Response.ok) {
        // Object Lock not enabled on bucket, or object doesn't have retention set
        return lockResult;
      }

      const responseXml = await s3Response.text();
      lockResult.exists = true;

      // Parse XML response
      const modeMatch = responseXml.match(/<Mode>([^<]+)<\/Mode>/);
      const dateMatch = responseXml.match(/<RetainUntilDate>([^<]+)<\/RetainUntilDate>/);

      if (modeMatch) {
        lockResult.lockMode = modeMatch[1];
        lockResult.lockActive = true;
      }

      if (dateMatch) {
        lockResult.retainUntil = dateMatch[1];
      }

      console.log(
        `[WORM] S3 Object Lock verified: ${key} with ${lockResult.lockMode} until ${lockResult.retainUntil}`
      );
    } catch (error) {
      console.error('[WORM] S3 lock check failed:', error.message);
      // Graceful degradation
    }

    return lockResult;
  }

  /**
   * Get immutability status without full content read
   * Quick check for WORM status
   * @param {string} closeId - Close pack identifier
   * @returns {Promise<object>} - WORM status summary
   */
  async getImmutabilityStatus(closeId) {
    const timestamp = new Date().toISOString();
    const status = {
      wormStatus: 'unknown',
      wormProvider: [],
      wormRetentionUntil: null,
      wormVerifiedAt: timestamp
    };

    try {
      const r2Key = `closepacks/${closeId}.zip`;

      // Check R2 metadata
      const r2Object = await this.r2.get(r2Key);
      if (r2Object) {
        status.wormProvider.push('r2');
        const metadata = r2Object.customMetadata || {};
        if (metadata['worm-retention-days']) {
          status.wormRetentionUntil = new Date(
            Date.now() + parseInt(metadata['worm-retention-days']) * 24 * 60 * 60 * 1000
          ).toISOString();
        }
      }

      // Check S3 Object Lock
      if (this.s3Enabled) {
        const lockStatus = await this._checkS3ObjectLock(closeId);
        if (lockStatus.exists && lockStatus.lockActive) {
          status.wormProvider.push('s3');
          if (lockStatus.retainUntil) {
            status.wormRetentionUntil = lockStatus.retainUntil;
          }
        }
      }

      // Determine overall WORM status
      if (status.wormProvider.length === 2) {
        status.wormStatus = 'full';
      } else if (status.wormProvider.length === 1) {
        status.wormStatus = 'r2_only';
      } else {
        status.wormStatus = 'none';
      }

      return status;
    } catch (error) {
      console.error('[WORM] Status check failed:', error.message);
      return status;
    }
  }
}

// CommonJS exports
module.exports = {
  WORM_CONFIG,
  WORMStorage
};
