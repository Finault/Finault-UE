/**
 * Provider Tags Module - Finault AI Cost Governance Platform
 *
 * Handles capture, normalization, storage, and querying of attribution tags/labels
 * from upstream AI providers and client requests. Enables cost attribution, reconciliation
 * matching, and multi-dimensional usage analysis.
 *
 * Cloudflare Workers compatible - CommonJS only, no Node.js built-ins
 */

// ============================================================================
// Configuration & Constants
// ============================================================================

const TAG_CONFIG = {
  MAX_TAGS_PER_REQUEST: 50,
  MAX_KEY_LENGTH: 64,
  MAX_VALUE_LENGTH: 256,
  RESERVED_KEYS: ['cost_center', 'project', 'environment', 'user_id', 'organization_id'],
  HEADER_PREFIX: 'x-finault-',
  TAG_HEADER: 'x-finault-tags',
};

const PROVIDER_TAG_SUPPORT = {
  openai: { userField: true, metadata: true },
  anthropic: { userField: true, metadata: true },
  azure: { userField: true, metadata: false },
  google: { userField: false, metadata: false },
  bedrock: { userField: false, metadata: false },
};

const HEADER_TAG_MAPPING = {
  'x-finault-project': 'project',
  'x-finault-team': 'team',
  'x-finault-environment': 'environment',
  'x-finault-department': 'department',
  'x-cost-center': 'cost_center',
};

// ============================================================================
// 1. Tag Extraction from Client Requests
// ============================================================================

/**
 * Extract and parse tags from client request headers
 *
 * Supports multiple tag sources:
 * - x-finault-tags: JSON object of key-value pairs
 * - x-finault-project, x-finault-team, x-finault-environment, etc.
 * - x-cost-center: backward compatibility
 *
 * @param {Request|Object} request - Fetch Request object or headers map
 * @returns {Object} Normalized tag object
 */
function extractClientTags(request) {
  const tags = {};

  // Get headers from Request object or direct headers map
  const headers = request.headers || request;

  // Extract x-finault-tags JSON header
  const tagsHeader = headers.get?.('x-finault-tags') || headers['x-finault-tags'];
  if (tagsHeader) {
    try {
      const parsed = JSON.parse(tagsHeader);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.assign(tags, parsed);
      }
    } catch (e) {
      // Log silently - invalid JSON in tags header is non-fatal
    }
  }

  // Extract individual header-mapped tags
  Object.entries(HEADER_TAG_MAPPING).forEach(([headerName, tagKey]) => {
    const value = headers.get?.(headerName) || headers[headerName];
    if (value && !tags[tagKey]) {
      tags[tagKey] = value;
    }
  });

  return tags;
}

// ============================================================================
// 2. Tag Extraction from Provider Request Bodies
// ============================================================================

/**
 * Extract attribution metadata from provider-specific request body fields
 *
 * Handles provider-specific tag extraction:
 * - OpenAI: user field, metadata object
 * - Anthropic: metadata.user_id
 * - Azure OpenAI: deployment name from URL
 * - Google Vertex: project ID from URL
 * - AWS Bedrock: region from model ARN
 *
 * @param {string} provider - Provider name (openai, anthropic, azure, google, bedrock)
 * @param {Object} requestBody - Provider request body
 * @param {string} requestUrl - Full request URL
 * @returns {Object} Provider-specific extracted tags
 */
function extractProviderTags(provider, requestBody, requestUrl) {
  const tags = {};

  if (!requestBody || typeof requestBody !== 'object') {
    return tags;
  }

  provider = (provider || '').toLowerCase();

  switch (provider) {
    case 'openai':
      if (requestBody.user) {
        tags.user = requestBody.user;
      }
      if (requestBody.metadata && typeof requestBody.metadata === 'object') {
        Object.assign(tags, requestBody.metadata);
      }
      break;

    case 'anthropic':
      if (requestBody.metadata && typeof requestBody.metadata === 'object') {
        if (requestBody.metadata.user_id) {
          tags.user = requestBody.metadata.user_id;
        }
        Object.assign(tags, requestBody.metadata);
      }
      break;

    case 'azure':
      // Extract deployment name from URL path: /deployments/{deployment}/chat/completions
      const azureMatch = requestUrl.match(/\/deployments\/([^/]+)\//i);
      if (azureMatch && azureMatch[1]) {
        tags.azure_deployment = azureMatch[1];
      }
      break;

    case 'google':
      // Extract GCP project from URL: projects/{project}/locations/{location}/endpoints/{endpoint}
      const googleMatch = requestUrl.match(/\/projects\/([^/]+)\//i);
      if (googleMatch && googleMatch[1]) {
        tags.gcp_project = googleMatch[1];
      }
      break;

    case 'bedrock':
      // Extract AWS region from model ARN: arn:aws:bedrock:{region}::foundation-model/{model}
      const bedrockMatch = requestUrl.match(/bedrock[:-]([a-z0-9-]+)[:-]/i);
      if (bedrockMatch && bedrockMatch[1]) {
        tags.aws_region = bedrockMatch[1];
      }
      break;
  }

  return tags;
}

// ============================================================================
// 3. Tag Forwarding to Upstream Providers
// ============================================================================

/**
 * Enrich upstream provider request with attribution tags
 *
 * Injects tags into provider-specific fields where supported:
 * - OpenAI: set user field
 * - Anthropic: set metadata field
 * - Others: tags stored locally only
 *
 * @param {string} provider - Provider name
 * @param {Object} requestBody - Provider request body (will be mutated)
 * @param {Object} tags - Normalized tags to inject
 * @returns {Object} Modified request body
 */
function enrichUpstreamRequest(provider, requestBody, tags) {
  if (!requestBody || typeof requestBody !== 'object' || !tags || typeof tags !== 'object') {
    return requestBody;
  }

  provider = (provider || '').toLowerCase();
  const support = PROVIDER_TAG_SUPPORT[provider];

  if (!support) {
    return requestBody;
  }

  // Clone to avoid mutation of input
  const enriched = { ...requestBody };

  if (support.userField && tags.user) {
    enriched.user = tags.user;
  }

  if (support.metadata) {
    enriched.metadata = enriched.metadata || {};
    Object.assign(enriched.metadata, tags);
  }

  return enriched;
}

// ============================================================================
// 4. Tag Normalization & Validation
// ============================================================================

/**
 * Normalize tag keys and values to storage format
 *
 * - Keys: lowercase, replace spaces with underscores, strip non-alphanumeric (except _ and -)
 * - Values: trim whitespace, truncate to MAX_VALUE_LENGTH
 *
 * @param {Object} rawTags - Raw tag object
 * @returns {Object} Normalized tag object
 */
function normalizeTags(rawTags) {
  if (!rawTags || typeof rawTags !== 'object') {
    return {};
  }

  const normalized = {};

  Object.entries(rawTags).forEach(([key, value]) => {
    // Normalize key
    let normalizedKey = String(key)
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '');

    // Skip empty keys
    if (!normalizedKey) {
      return;
    }

    // Truncate key to max length
    if (normalizedKey.length > TAG_CONFIG.MAX_KEY_LENGTH) {
      normalizedKey = normalizedKey.substring(0, TAG_CONFIG.MAX_KEY_LENGTH);
    }

    // Normalize value
    let normalizedValue = String(value).trim();

    // Truncate value to max length
    if (normalizedValue.length > TAG_CONFIG.MAX_VALUE_LENGTH) {
      normalizedValue = normalizedValue.substring(0, TAG_CONFIG.MAX_VALUE_LENGTH);
    }

    // Skip empty values
    if (normalizedValue) {
      normalized[normalizedKey] = normalizedValue;
    }
  });

  return normalized;
}

/**
 * Validate normalized tags for compliance with constraints
 *
 * @param {Object} tags - Normalized tag object
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateTags(tags) {
  const errors = [];

  if (!tags || typeof tags !== 'object') {
    return { valid: false, errors: ['Tags must be an object'] };
  }

  const tagCount = Object.keys(tags).length;
  if (tagCount > TAG_CONFIG.MAX_TAGS_PER_REQUEST) {
    errors.push(
      `Too many tags: ${tagCount} exceeds maximum of ${TAG_CONFIG.MAX_TAGS_PER_REQUEST}`
    );
  }

  Object.entries(tags).forEach(([key, value]) => {
    if (key.length > TAG_CONFIG.MAX_KEY_LENGTH) {
      errors.push(`Tag key "${key}" exceeds max length of ${TAG_CONFIG.MAX_KEY_LENGTH}`);
    }

    if (typeof value !== 'string' || value.length > TAG_CONFIG.MAX_VALUE_LENGTH) {
      errors.push(`Tag value for "${key}" exceeds max length of ${TAG_CONFIG.MAX_VALUE_LENGTH}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// 5. Tag Merging Strategy
// ============================================================================

/**
 * Merge tags from multiple sources with priority ordering
 *
 * Priority (highest to lowest):
 * 1. Client headers (explicit user intent)
 * 2. Request body metadata
 * 3. Provider-extracted tags (inferred)
 *
 * @param {Object} clientTags - Tags from client headers
 * @param {Object} bodyTags - Tags from request body
 * @param {Object} providerTags - Tags extracted from provider
 * @returns {Object} Merged tag object with _source metadata
 */
function mergeTags(clientTags = {}, bodyTags = {}, providerTags = {}) {
  const merged = {};
  const sources = {};

  // Apply in reverse priority order so higher priority overwrites
  [
    { tags: providerTags, source: 'provider' },
    { tags: bodyTags, source: 'body' },
    { tags: clientTags, source: 'client' },
  ].forEach(({ tags, source }) => {
    Object.entries(tags || {}).forEach(([key, value]) => {
      merged[key] = value;
      sources[key] = source;
    });
  });

  return {
    ...merged,
    _source: sources,
  };
}

// ============================================================================
// 6. Tag Storage Helpers
// ============================================================================

/**
 * Prepare tags for storage in usage table's metadata JSONB column
 *
 * - Splits reserved keys into top-level usage columns
 * - Packs remaining tags into metadata.tags
 * - Generates tag fingerprint for dedup/matching
 *
 * @param {Object} tags - Normalized, merged tag object
 * @returns {Object} { columns: {...}, metadataTags: {...}, fingerprint: string }
 */
function prepareForStorage(tags) {
  if (!tags || typeof tags !== 'object') {
    return { columns: {}, metadataTags: {}, fingerprint: '' };
  }

  const columns = {};
  const metadataTags = {};

  Object.entries(tags).forEach(([key, value]) => {
    if (key === '_source') {
      // Skip internal metadata
      return;
    }

    if (TAG_CONFIG.RESERVED_KEYS.includes(key)) {
      columns[key] = value;
    } else {
      metadataTags[key] = value;
    }
  });

  // Generate fingerprint: sorted JSON hash of all tags
  const sortedKeys = Object.keys(tags)
    .filter(k => k !== '_source')
    .sort();
  const fingerprint = simpleHash(JSON.stringify(sortedKeys.map(k => [k, tags[k]])));

  return {
    columns,
    metadataTags,
    fingerprint,
  };
}

/**
 * Simple hash function for fingerprinting (no crypto module)
 * Uses djb2 algorithm for consistency
 *
 * @param {string} str - String to hash
 * @returns {string} Hex hash string
 */
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// ============================================================================
// 7. Tag-Based Query Helpers
// ============================================================================

/**
 * Add tag filter to Supabase query using JSONB contains
 *
 * @param {Object} query - Supabase query builder
 * @param {string} tagKey - Tag key to filter on
 * @param {string} tagValue - Tag value to match
 * @returns {Object} Modified query
 */
function buildTagFilter(query, tagKey, tagValue) {
  if (!query || !tagKey || tagValue === undefined) {
    return query;
  }

  const filterObj = {};
  filterObj[`metadata->tags->${tagKey}`] = tagValue;

  return query.contains('metadata', filterObj);
}

/**
 * Apply multiple tag filters to Supabase query
 *
 * @param {Object} query - Supabase query builder
 * @param {Object} tagFilters - { tagKey: tagValue, ... }
 * @returns {Object} Modified query
 */
function buildMultiTagFilter(query, tagFilters) {
  if (!query || !tagFilters || typeof tagFilters !== 'object') {
    return query;
  }

  let filtered = query;
  Object.entries(tagFilters).forEach(([key, value]) => {
    filtered = buildTagFilter(filtered, key, value);
  });

  return filtered;
}

/**
 * Query for all unique tag keys in organization's usage records
 *
 * @param {Object} supabaseClient - Supabase client instance
 * @param {string} orgId - Organization ID
 * @returns {Promise<string[]>} Array of unique tag keys
 */
async function getUniqueTagKeys(supabaseClient, orgId) {
  if (!supabaseClient || !orgId) {
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('usage')
      .select('metadata')
      .eq('organization_id', orgId)
      .not('metadata->tags', 'is', null);

    if (error) {
      console.error('Error querying unique tag keys:', error);
      return [];
    }

    const keySet = new Set();
    (data || []).forEach(record => {
      if (record.metadata?.tags && typeof record.metadata.tags === 'object') {
        Object.keys(record.metadata.tags).forEach(k => keySet.add(k));
      }
    });

    return Array.from(keySet).sort();
  } catch (e) {
    console.error('Error in getUniqueTagKeys:', e);
    return [];
  }
}

/**
 * Query for all values of a specific tag key in organization
 *
 * @param {Object} supabaseClient - Supabase client instance
 * @param {string} orgId - Organization ID
 * @param {string} tagKey - Tag key to query
 * @returns {Promise<string[]>} Array of unique values for the tag key
 */
async function getTagValues(supabaseClient, orgId, tagKey) {
  if (!supabaseClient || !orgId || !tagKey) {
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('usage')
      .select('metadata')
      .eq('organization_id', orgId)
      .not('metadata->tags', 'is', null);

    if (error) {
      console.error('Error querying tag values:', error);
      return [];
    }

    const valueSet = new Set();
    (data || []).forEach(record => {
      if (record.metadata?.tags?.[tagKey]) {
        valueSet.add(record.metadata.tags[tagKey]);
      }
    });

    return Array.from(valueSet).sort();
  } catch (e) {
    console.error('Error in getTagValues:', e);
    return [];
  }
}

// ============================================================================
// 8. Reconciliation Tag Matching
// ============================================================================

/**
 * Compute tag similarity between usage records and invoice line items
 *
 * Identifies matched keys and mismatches for reconciliation.
 * Score = matched keys / total unique keys across both sets
 *
 * @param {Object} usageTags - Tags from usage record
 * @param {Object} invoiceTags - Tags from invoice line item
 * @returns {Object} { matchedKeys: [], score: 0-1, mismatches: [] }
 */
function computeTagIntersection(usageTags = {}, invoiceTags = {}) {
  const matchedKeys = [];
  const mismatches = [];
  const allKeys = new Set([
    ...Object.keys(usageTags),
    ...Object.keys(invoiceTags),
  ]);

  allKeys.forEach(key => {
    const usageValue = usageTags[key];
    const invoiceValue = invoiceTags[key];

    if (usageValue !== undefined && invoiceValue !== undefined) {
      if (usageValue === invoiceValue) {
        matchedKeys.push(key);
      } else {
        mismatches.push({ key, usage: usageValue, invoice: invoiceValue });
      }
    }
  });

  const score = allKeys.size > 0 ? matchedKeys.length / allKeys.size : 0;

  return {
    matchedKeys,
    score,
    mismatches,
  };
}

// ============================================================================
// 9. Tag Analytics
// ============================================================================

/**
 * Group usage records by tag value and aggregate costs/tokens
 *
 * @param {Object[]} records - Array of usage records with tags and cost/token data
 * @param {string} tagKey - Tag key to group by
 * @returns {Object} { tagValue: { count, totalCost, totalTokens }, ... }
 */
function aggregateByTag(records = [], tagKey) {
  if (!Array.isArray(records) || !tagKey) {
    return {};
  }

  const aggregated = {};

  records.forEach(record => {
    const value = record.metadata?.tags?.[tagKey];
    if (!value) return;

    if (!aggregated[value]) {
      aggregated[value] = { count: 0, totalCost: 0, totalTokens: 0 };
    }

    aggregated[value].count += 1;
    aggregated[value].totalCost += record.cost || 0;
    aggregated[value].totalTokens += (record.prompt_tokens || 0) + (record.completion_tokens || 0);
  });

  return aggregated;
}

/**
 * Analyze tag coverage in usage records
 *
 * @param {Object[]} records - Array of usage records
 * @returns {Object} { coveragePercent: 0-100, keyFrequency: { key: count, ... } }
 */
function getTagCoverage(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return { coveragePercent: 0, keyFrequency: {} };
  }

  const keyFrequency = {};
  let recordsWithTags = 0;

  records.forEach(record => {
    const tags = record.metadata?.tags;
    if (tags && typeof tags === 'object' && Object.keys(tags).length > 0) {
      recordsWithTags += 1;
      Object.keys(tags).forEach(key => {
        keyFrequency[key] = (keyFrequency[key] || 0) + 1;
      });
    }
  });

  const coveragePercent = records.length > 0
    ? Math.round((recordsWithTags / records.length) * 100)
    : 0;

  return { coveragePercent, keyFrequency };
}

/**
 * Detect records with missing or unusual tag values
 *
 * @param {Object[]} records - Array of usage records
 * @param {string} tagKey - Tag key to analyze
 * @returns {Object} { missing: [], unusual: [] }
 */
function detectTagAnomalies(records = [], tagKey) {
  if (!Array.isArray(records) || !tagKey) {
    return { missing: [], unusual: [] };
  }

  const missing = [];
  const valueFrequency = {};

  records.forEach((record, idx) => {
    const value = record.metadata?.tags?.[tagKey];

    if (!value) {
      missing.push(idx);
      return;
    }

    valueFrequency[value] = (valueFrequency[value] || 0) + 1;
  });

  // Find unusual values (appearing less than 5% of the time)
  const threshold = Math.ceil(records.length * 0.05);
  const unusual = [];

  records.forEach((record, idx) => {
    const value = record.metadata?.tags?.[tagKey];
    if (value && (valueFrequency[value] || 0) < threshold) {
      unusual.push({ index: idx, value, frequency: valueFrequency[value] });
    }
  });

  return { missing, unusual };
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  TAG_CONFIG,
  PROVIDER_TAG_SUPPORT,
  extractClientTags,
  extractProviderTags,
  enrichUpstreamRequest,
  normalizeTags,
  validateTags,
  mergeTags,
  prepareForStorage,
  buildTagFilter,
  buildMultiTagFilter,
  getUniqueTagKeys,
  getTagValues,
  computeTagIntersection,
  aggregateByTag,
  getTagCoverage,
  detectTagAnomalies,
};
