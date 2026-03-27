/**
 * Open-source AIEI Receipt Validator
 * Validates AIEI (AI Inference Economic Identity) receipt structure and integrity
 */

import { AIEI_SCHEMA, AIEI_SCHEMA_MINIMAL } from './schema';

export { AIEI_SCHEMA, AIEI_SCHEMA_MINIMAL } from './schema';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AIEIWho {
  org_id: string;
  customer_id: string;
  user_id: string;
  session_id?: string;
  api_key_prefix?: string;
}

export interface AIEIWhat {
  model: string;
  provider: 'openai' | 'anthropic' | 'google' | 'meta' | 'mistral' | 'together' | 'replicate' | 'other';
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  temperature?: number;
  max_tokens?: number;
  cache_hit?: boolean;
}

export interface AIEIWorth {
  cost: number;
  revenue?: number;
  margin?: number;
  cost_center?: string;
}

export interface AIEIRules {
  budget_limit?: number;
  policy?: string;
  tags?: Record<string, string>;
}

export interface AIEIProof {
  receipt_hash: string;
  chain_hash?: string;
  timestamp: string;
  signature?: string;
  nonce?: string;
}

export interface AIEIReceipt {
  receipt_id: string;
  who: AIEIWho;
  what: AIEIWhat;
  worth: AIEIWorth;
  rules?: AIEIRules;
  proof: AIEIProof;
  metadata?: {
    version?: string;
    request_id?: string;
    source?: 'gateway' | 'sdk' | 'webhook' | 'manual';
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  receipt?: AIEIReceipt;
}

export interface ChainValidationResult {
  valid: boolean;
  total_receipts: number;
  valid_receipts: number;
  invalid_receipts: number;
  chain_broken_at?: number;
  errors: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN VALIDATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class AIEIValidator {
  /**
   * Validate a complete AIEI receipt
   * Checks all required fields, types, and business logic
   */
  static validateReceipt(receipt: any, minimal: boolean = false): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (!receipt || typeof receipt !== 'object') {
      return {
        valid: false,
        errors: [{ field: 'root', message: 'Receipt must be a non-null object' }],
        warnings: []
      };
    }

    // Check required top-level fields
    const requiredFields = ['receipt_id', 'who', 'what', 'worth', 'proof'];
    for (const field of requiredFields) {
      if (!(field in receipt)) {
        errors.push({
          field,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Validate receipt_id
    if (receipt.receipt_id) {
      if (typeof receipt.receipt_id !== 'string') {
        errors.push({ field: 'receipt_id', message: 'receipt_id must be a string' });
      } else if (!receipt.receipt_id.match(/^rcpt_(live|test)_[a-zA-Z0-9_-]{10,}$/)) {
        warnings.push('receipt_id does not follow expected format (rcpt_live_xxx or rcpt_test_xxx)');
      }
    }

    // Validate WHO section
    if (receipt.who) {
      const whoErrors = this._validateWho(receipt.who);
      errors.push(...whoErrors);
    }

    // Validate WHAT section
    if (receipt.what) {
      const whatErrors = this._validateWhat(receipt.what);
      errors.push(...whatErrors);
    }

    // Validate WORTH section
    if (receipt.worth) {
      const worthErrors = this._validateWorth(receipt.worth);
      errors.push(...worthErrors);
    }

    // Validate PROOF section
    if (receipt.proof) {
      const proofErrors = this._validateProof(receipt.proof);
      errors.push(...proofErrors);
    }

    // Validate RULES section (optional)
    if (receipt.rules) {
      const rulesErrors = this._validateRules(receipt.rules);
      errors.push(...rulesErrors);
    }

    // Compute margin if both revenue and cost are present
    if (receipt.worth?.revenue !== undefined && receipt.worth?.cost !== undefined) {
      const expectedMargin = receipt.worth.revenue - receipt.worth.cost;
      if (receipt.worth.margin !== undefined) {
        const diff = Math.abs(expectedMargin - receipt.worth.margin);
        if (diff > 0.0001) {
          warnings.push(
            `Margin does not match (revenue - cost). Expected ${expectedMargin}, got ${receipt.worth.margin}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      receipt: errors.length === 0 ? (receipt as AIEIReceipt) : undefined
    };
  }

  /**
   * Validate a chain of receipts for integrity
   * Each receipt's chain_hash should match the previous receipt's receipt_hash
   */
  static validateChain(receipts: any[]): ChainValidationResult {
    const errors: string[] = [];
    let chainBrokenAt: number | undefined;

    if (!Array.isArray(receipts)) {
      return {
        valid: false,
        total_receipts: 0,
        valid_receipts: 0,
        invalid_receipts: 0,
        errors: ['Input must be an array of receipts']
      };
    }

    let validCount = 0;
    let invalidCount = 0;
    let previousHash: string | undefined;

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      const validation = this.validateReceipt(receipt, true);

      if (!validation.valid) {
        invalidCount++;
        if (chainBrokenAt === undefined) {
          chainBrokenAt = i;
        }
        errors.push(`Receipt ${i}: ${validation.errors[0]?.message || 'Invalid receipt'}`);
        continue;
      }

      validCount++;

      // Check chain integrity
      if (i > 0 && previousHash) {
        if (receipt.proof?.chain_hash !== previousHash) {
          errors.push(`Chain broken at receipt ${i}: chain_hash does not match previous receipt_hash`);
          if (chainBrokenAt === undefined) {
            chainBrokenAt = i;
          }
        }
      }

      previousHash = receipt.proof?.receipt_hash;
    }

    return {
      valid: invalidCount === 0 && chainBrokenAt === undefined,
      total_receipts: receipts.length,
      valid_receipts: validCount,
      invalid_receipts: invalidCount,
      chain_broken_at: chainBrokenAt,
      errors
    };
  }

  /**
   * Compute the receipt hash using SHA-256 (simplified)
   * In production, use crypto.subtle.digest or crypto-js
   */
  static computeReceiptHash(receipt: any): string {
    // Create a normalized version without the proof field
    const normalized = {
      receipt_id: receipt.receipt_id,
      who: receipt.who,
      what: receipt.what,
      worth: receipt.worth,
      rules: receipt.rules,
      metadata: receipt.metadata
    };

    const json = JSON.stringify(normalized, null, 0);
    return 'sha256_' + this._simpleHash(json);
  }

  /**
   * Verify that a receipt's hash matches its expected hash
   */
  static verifyReceiptHash(receipt: any): boolean {
    if (!receipt.proof?.receipt_hash) {
      return false;
    }

    const expectedHash = this.computeReceiptHash(receipt);
    return receipt.proof.receipt_hash === expectedHash;
  }

  /**
   * Validate WHO section (identity and authorization)
   */
  private static _validateWho(who: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof who !== 'object' || who === null) {
      errors.push({ field: 'who', message: 'WHO section must be an object' });
      return errors;
    }

    const requiredFields = ['org_id', 'customer_id', 'user_id'];
    for (const field of requiredFields) {
      if (!(field in who)) {
        errors.push({
          field: `who.${field}`,
          message: `Missing required field: who.${field}`
        });
      } else if (typeof who[field] !== 'string' || who[field].length === 0) {
        errors.push({
          field: `who.${field}`,
          message: `who.${field} must be a non-empty string`,
          value: who[field]
        });
      }
    }

    return errors;
  }

  /**
   * Validate WHAT section (technical details)
   */
  private static _validateWhat(what: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof what !== 'object' || what === null) {
      errors.push({ field: 'what', message: 'WHAT section must be an object' });
      return errors;
    }

    const requiredFields = ['model', 'provider', 'tokens_in', 'tokens_out', 'latency_ms'];
    const requiredTypes = {
      model: 'string',
      provider: 'string',
      tokens_in: 'number',
      tokens_out: 'number',
      latency_ms: 'number'
    };

    for (const field of requiredFields) {
      if (!(field in what)) {
        errors.push({
          field: `what.${field}`,
          message: `Missing required field: what.${field}`
        });
      } else if (typeof what[field] !== requiredTypes[field as keyof typeof requiredTypes]) {
        errors.push({
          field: `what.${field}`,
          message: `what.${field} must be of type ${requiredTypes[field as keyof typeof requiredTypes]}`,
          value: what[field]
        });
      }
    }

    // Validate provider is in allowed list
    const validProviders = ['openai', 'anthropic', 'google', 'meta', 'mistral', 'together', 'replicate', 'other'];
    if (what.provider && !validProviders.includes(what.provider)) {
      errors.push({
        field: 'what.provider',
        message: `what.provider must be one of: ${validProviders.join(', ')}`,
        value: what.provider
      });
    }

    // Validate tokens are non-negative
    if (typeof what.tokens_in === 'number' && what.tokens_in < 0) {
      errors.push({
        field: 'what.tokens_in',
        message: 'what.tokens_in must be non-negative',
        value: what.tokens_in
      });
    }

    if (typeof what.tokens_out === 'number' && what.tokens_out < 0) {
      errors.push({
        field: 'what.tokens_out',
        message: 'what.tokens_out must be non-negative',
        value: what.tokens_out
      });
    }

    if (typeof what.latency_ms === 'number' && what.latency_ms < 0) {
      errors.push({
        field: 'what.latency_ms',
        message: 'what.latency_ms must be non-negative',
        value: what.latency_ms
      });
    }

    return errors;
  }

  /**
   * Validate WORTH section (financial metrics)
   */
  private static _validateWorth(worth: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof worth !== 'object' || worth === null) {
      errors.push({ field: 'worth', message: 'WORTH section must be an object' });
      return errors;
    }

    if (!('cost' in worth)) {
      errors.push({
        field: 'worth.cost',
        message: 'Missing required field: worth.cost'
      });
    } else if (typeof worth.cost !== 'number') {
      errors.push({
        field: 'worth.cost',
        message: 'worth.cost must be a number',
        value: worth.cost
      });
    } else if (worth.cost < 0) {
      errors.push({
        field: 'worth.cost',
        message: 'worth.cost must be non-negative',
        value: worth.cost
      });
    }

    if (worth.revenue !== undefined) {
      if (typeof worth.revenue !== 'number') {
        errors.push({
          field: 'worth.revenue',
          message: 'worth.revenue must be a number',
          value: worth.revenue
        });
      } else if (worth.revenue < 0) {
        errors.push({
          field: 'worth.revenue',
          message: 'worth.revenue must be non-negative',
          value: worth.revenue
        });
      }
    }

    if (worth.margin !== undefined) {
      if (typeof worth.margin !== 'number') {
        errors.push({
          field: 'worth.margin',
          message: 'worth.margin must be a number',
          value: worth.margin
        });
      }
    }

    return errors;
  }

  /**
   * Validate PROOF section (cryptographic verification)
   */
  private static _validateProof(proof: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof proof !== 'object' || proof === null) {
      errors.push({ field: 'proof', message: 'PROOF section must be an object' });
      return errors;
    }

    if (!('receipt_hash' in proof)) {
      errors.push({
        field: 'proof.receipt_hash',
        message: 'Missing required field: proof.receipt_hash'
      });
    } else if (typeof proof.receipt_hash !== 'string') {
      errors.push({
        field: 'proof.receipt_hash',
        message: 'proof.receipt_hash must be a string',
        value: proof.receipt_hash
      });
    } else if (!proof.receipt_hash.match(/^sha256_[a-f0-9]{64}$/i)) {
      errors.push({
        field: 'proof.receipt_hash',
        message: 'proof.receipt_hash must be in format sha256_<64_hex_chars>',
        value: proof.receipt_hash
      });
    }

    if (!('timestamp' in proof)) {
      errors.push({
        field: 'proof.timestamp',
        message: 'Missing required field: proof.timestamp'
      });
    } else if (typeof proof.timestamp !== 'string') {
      errors.push({
        field: 'proof.timestamp',
        message: 'proof.timestamp must be a string',
        value: proof.timestamp
      });
    } else if (!this._isValidISO8601(proof.timestamp)) {
      errors.push({
        field: 'proof.timestamp',
        message: 'proof.timestamp must be a valid ISO 8601 datetime',
        value: proof.timestamp
      });
    }

    if (proof.chain_hash && typeof proof.chain_hash !== 'string') {
      errors.push({
        field: 'proof.chain_hash',
        message: 'proof.chain_hash must be a string',
        value: proof.chain_hash
      });
    }

    return errors;
  }

  /**
   * Validate RULES section (governance)
   */
  private static _validateRules(rules: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof rules !== 'object' || rules === null) {
      errors.push({ field: 'rules', message: 'RULES section must be an object' });
      return errors;
    }

    if (rules.budget_limit !== undefined && typeof rules.budget_limit !== 'number') {
      errors.push({
        field: 'rules.budget_limit',
        message: 'rules.budget_limit must be a number',
        value: rules.budget_limit
      });
    }

    if (rules.policy !== undefined && typeof rules.policy !== 'string') {
      errors.push({
        field: 'rules.policy',
        message: 'rules.policy must be a string',
        value: rules.policy
      });
    }

    if (rules.tags !== undefined) {
      if (typeof rules.tags !== 'object' || Array.isArray(rules.tags)) {
        errors.push({
          field: 'rules.tags',
          message: 'rules.tags must be an object (dict)',
          value: rules.tags
        });
      } else {
        // Validate all tag values are strings
        for (const [key, value] of Object.entries(rules.tags)) {
          if (typeof value !== 'string') {
            errors.push({
              field: `rules.tags.${key}`,
              message: 'Tag values must be strings',
              value
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Simple hash function (NOT cryptographically secure, for testing only)
   * In production, use crypto.subtle.digest
   */
  private static _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  /**
   * Check if a string is a valid ISO 8601 datetime
   */
  private static _isValidISO8601(str: string): boolean {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (!iso8601Regex.test(str)) {
      return false;
    }
    try {
      new Date(str);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience functions for direct use
 */

export function validateReceipt(receipt: any): ValidationResult {
  return AIEIValidator.validateReceipt(receipt);
}

export function validateChain(receipts: any[]): ChainValidationResult {
  return AIEIValidator.validateChain(receipts);
}

export function computeReceiptHash(receipt: any): string {
  return AIEIValidator.computeReceiptHash(receipt);
}

export function verifyReceiptHash(receipt: any): boolean {
  return AIEIValidator.verifyReceiptHash(receipt);
}

export default AIEIValidator;
