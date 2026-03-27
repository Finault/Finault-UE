/**
 * JSON Schema definition for AIEI (AI Inference Economic Identity) receipts
 * Represents the complete structure of an AIEI receipt with all required and optional fields
 */

export const AIEI_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AIEI Receipt',
  description: 'AI Inference Economic Identity Receipt - Tracks who, what, worth, rules, and proof of an LLM call',
  type: 'object',
  required: ['receipt_id', 'who', 'what', 'worth', 'proof'],
  properties: {
    // ═══════════════════════════════════════════════════════════════════
    // RECEIPT IDENTIFICATION
    // ═══════════════════════════════════════════════════════════════════
    receipt_id: {
      type: 'string',
      description: 'Unique receipt identifier (e.g., rcpt_live_xxx)',
      pattern: '^rcpt_(live|test)_[a-zA-Z0-9_-]{10,}$'
    },

    // ═══════════════════════════════════════════════════════════════════
    // WHO: Identity and Authorization
    // ═══════════════════════════════════════════════════════════════════
    who: {
      type: 'object',
      description: 'Identity and authorization context',
      required: ['org_id', 'customer_id', 'user_id'],
      properties: {
        org_id: {
          type: 'string',
          description: 'Organization ID that owns this request',
          minLength: 1
        },
        customer_id: {
          type: 'string',
          description: 'Customer ID for billing and analytics',
          minLength: 1
        },
        user_id: {
          type: 'string',
          description: 'User ID that made this request',
          minLength: 1
        },
        session_id: {
          type: 'string',
          description: 'Optional session ID for tracking user sessions'
        },
        api_key_prefix: {
          type: 'string',
          description: 'Prefix of the API key used (e.g., fk_live_xxx)',
          pattern: '^[a-z]+_[a-z]+_[a-zA-Z0-9]{3,}$'
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // WHAT: Technical Details of the Inference
    // ═══════════════════════════════════════════════════════════════════
    what: {
      type: 'object',
      description: 'Technical details of the LLM inference call',
      required: ['model', 'provider', 'tokens_in', 'tokens_out', 'latency_ms'],
      properties: {
        model: {
          type: 'string',
          description: 'Model identifier (e.g., gpt-4, claude-3-opus)',
          minLength: 1
        },
        provider: {
          type: 'string',
          description: 'Provider name (e.g., openai, anthropic, google)',
          enum: ['openai', 'anthropic', 'google', 'meta', 'mistral', 'together', 'replicate', 'other']
        },
        tokens_in: {
          type: 'integer',
          description: 'Number of input tokens',
          minimum: 0
        },
        tokens_out: {
          type: 'integer',
          description: 'Number of output tokens',
          minimum: 0
        },
        latency_ms: {
          type: 'integer',
          description: 'Latency of the inference in milliseconds',
          minimum: 0
        },
        temperature: {
          type: 'number',
          description: 'Optional temperature parameter used',
          minimum: 0,
          maximum: 2
        },
        max_tokens: {
          type: 'integer',
          description: 'Optional maximum tokens limit',
          minimum: 1
        },
        cache_hit: {
          type: 'boolean',
          description: 'Whether this used a cached response'
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // WORTH: Financial and Business Metrics
    // ═══════════════════════════════════════════════════════════════════
    worth: {
      type: 'object',
      description: 'Financial metrics and cost tracking',
      required: ['cost'],
      properties: {
        cost: {
          type: 'number',
          description: 'Cost of this inference in USD',
          minimum: 0,
          multipleOf: 0.000001
        },
        revenue: {
          type: 'number',
          description: 'Optional revenue attributed to this inference',
          minimum: 0,
          multipleOf: 0.000001
        },
        margin: {
          type: 'number',
          description: 'Optional margin (revenue - cost)',
          multipleOf: 0.000001
        },
        cost_center: {
          type: 'string',
          description: 'Optional cost center for allocation'
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // RULES: Governance and Policies
    // ═══════════════════════════════════════════════════════════════════
    rules: {
      type: 'object',
      description: 'Governance rules and policy constraints',
      properties: {
        budget_limit: {
          type: 'number',
          description: 'Budget limit for this customer',
          minimum: 0
        },
        policy: {
          type: 'string',
          description: 'Policy name or ID that governed this call'
        },
        tags: {
          type: 'object',
          description: 'Custom tags for categorization',
          additionalProperties: { type: 'string' }
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // PROOF: Cryptographic Verification
    // ═══════════════════════════════════════════════════════════════════
    proof: {
      type: 'object',
      description: 'Cryptographic proof and verification data',
      required: ['receipt_hash', 'timestamp'],
      properties: {
        receipt_hash: {
          type: 'string',
          description: 'SHA-256 hash of the receipt (excluding this field)',
          pattern: '^sha256_[a-f0-9]{64}$'
        },
        chain_hash: {
          type: 'string',
          description: 'Optional hash chain linking to previous receipt',
          pattern: '^sha256_[a-f0-9]{64}$'
        },
        timestamp: {
          type: 'string',
          description: 'ISO 8601 timestamp when receipt was created',
          format: 'date-time'
        },
        signature: {
          type: 'string',
          description: 'Optional digital signature of the receipt'
        },
        nonce: {
          type: 'string',
          description: 'Optional nonce for replay protection'
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // METADATA: Additional Information
    // ═══════════════════════════════════════════════════════════════════
    metadata: {
      type: 'object',
      description: 'Optional metadata',
      properties: {
        version: {
          type: 'string',
          description: 'AIEI specification version',
          default: '1.0.0'
        },
        request_id: {
          type: 'string',
          description: 'Correlation ID for this request'
        },
        source: {
          type: 'string',
          description: 'Source of the receipt (e.g., gateway, sdk, webhook)',
          enum: ['gateway', 'sdk', 'webhook', 'manual']
        }
      }
    }
  },

  additionalProperties: false
};

/**
 * Lighter schema for minimal receipt validation
 * Allows quick validation without full schema enforcement
 */
export const AIEI_SCHEMA_MINIMAL = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AIEI Receipt (Minimal)',
  description: 'Minimal AIEI receipt with only required fields',
  type: 'object',
  required: ['receipt_id', 'who', 'what', 'worth', 'proof'],
  properties: {
    receipt_id: { type: 'string' },
    who: {
      type: 'object',
      required: ['org_id', 'customer_id', 'user_id'],
      properties: {
        org_id: { type: 'string' },
        customer_id: { type: 'string' },
        user_id: { type: 'string' }
      }
    },
    what: {
      type: 'object',
      required: ['model', 'provider', 'tokens_in', 'tokens_out', 'latency_ms'],
      properties: {
        model: { type: 'string' },
        provider: { type: 'string' },
        tokens_in: { type: 'integer' },
        tokens_out: { type: 'integer' },
        latency_ms: { type: 'integer' }
      }
    },
    worth: {
      type: 'object',
      required: ['cost'],
      properties: {
        cost: { type: 'number' },
        revenue: { type: 'number' },
        margin: { type: 'number' }
      }
    },
    proof: {
      type: 'object',
      required: ['receipt_hash', 'timestamp'],
      properties: {
        receipt_hash: { type: 'string' },
        timestamp: { type: 'string' }
      }
    }
  }
};

/**
 * Field descriptions for documentation
 */
export const AIEI_FIELD_DESCRIPTIONS = {
  WHO: {
    description: 'Identity and authorization context of the request',
    required_fields: ['org_id', 'customer_id', 'user_id'],
    fields: {
      org_id: 'Organization that owns this inference',
      customer_id: 'Customer for billing purposes',
      user_id: 'End user who triggered this inference',
      session_id: 'Session tracking (optional)',
      api_key_prefix: 'Masked API key for audit (optional)'
    }
  },
  WHAT: {
    description: 'Technical details of the inference call',
    required_fields: ['model', 'provider', 'tokens_in', 'tokens_out', 'latency_ms'],
    fields: {
      model: 'Model identifier (e.g., gpt-4, claude-3-opus)',
      provider: 'Provider name (openai, anthropic, google, etc.)',
      tokens_in: 'Number of input tokens consumed',
      tokens_out: 'Number of output tokens generated',
      latency_ms: 'Time taken for inference in milliseconds',
      temperature: 'Temperature parameter (optional)',
      max_tokens: 'Max tokens limit (optional)',
      cache_hit: 'Whether response was cached (optional)'
    }
  },
  WORTH: {
    description: 'Financial metrics and business value',
    required_fields: ['cost'],
    fields: {
      cost: 'Cost of inference in USD',
      revenue: 'Revenue attributed to this inference (optional)',
      margin: 'Profit margin = revenue - cost (computed if both present)',
      cost_center: 'Cost center for allocation (optional)'
    }
  },
  RULES: {
    description: 'Governance and policy constraints',
    required_fields: [],
    fields: {
      budget_limit: 'Budget limit for customer (optional)',
      policy: 'Policy name that governed this call (optional)',
      tags: 'Custom categorization tags (optional)'
    }
  },
  PROOF: {
    description: 'Cryptographic verification and integrity',
    required_fields: ['receipt_hash', 'timestamp'],
    fields: {
      receipt_hash: 'SHA-256 hash for integrity verification',
      chain_hash: 'Hash chain linking to previous receipt (optional)',
      timestamp: 'ISO 8601 timestamp',
      signature: 'Digital signature (optional)',
      nonce: 'Replay protection nonce (optional)'
    }
  }
};
