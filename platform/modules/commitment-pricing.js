/**
 * Finault Commitment & Provisioned Throughput Pricing Module
 *
 * Implements enterprise AI pricing models including:
 * - Reserved capacity (AWS Bedrock Provisioned Throughput)
 * - Committed-use discounts (Google Vertex AI)
 * - Volume discounts (tiered pricing)
 * - Prompt caching discounts (Anthropic, OpenAI)
 * - Savings plans (AWS-style dollar commitments)
 * - Enterprise agreements (custom pricing)
 *
 * FOCUS 1.3 compliant pricing calculations with amortization,
 * utilization tracking, and savings intelligence.
 *
 * @module commitment-pricing
 * @requires CommonJS (Cloudflare Workers compatible)
 * @version 2.0.0
 */

/**
 * Commitment Type Enumeration
 * Defines all supported pricing commitment models
 * @constant {Object}
 */
const COMMITMENT_TYPES = {
  RESERVED_CAPACITY: 'reserved_capacity',
  COMMITTED_USE: 'committed_use',
  VOLUME_DISCOUNT: 'volume_discount',
  PROMPT_CACHING: 'prompt_caching',
  SAVINGS_PLAN: 'savings_plan',
  ENTERPRISE_AGREEMENT: 'enterprise_agreement',
};

/**
 * Commitment Status Enumeration
 * Tracks the lifecycle state of a commitment
 * @constant {Object}
 */
const COMMITMENT_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  PENDING: 'pending',
  CANCELLED: 'cancelled',
};

/**
 * Volume Pricing Tiers by Provider and Model
 * Tier structure: { upTo: maxTokens, inputRate: ¢/token, outputRate: ¢/token }
 * @constant {Object}
 */
const DEFAULT_VOLUME_TIERS = {
  openai: {
    'gpt-4o': [
      { upTo: 1_000_000, inputRate: 2.50, outputRate: 10.00 },
      { upTo: 10_000_000, inputRate: 2.25, outputRate: 9.00 },
      { upTo: 100_000_000, inputRate: 2.00, outputRate: 8.00 },
      { upTo: Infinity, inputRate: 1.75, outputRate: 7.00 },
    ],
    'gpt-4o-mini': [
      { upTo: 10_000_000, inputRate: 0.15, outputRate: 0.60 },
      { upTo: 100_000_000, inputRate: 0.135, outputRate: 0.54 },
      { upTo: Infinity, inputRate: 0.12, outputRate: 0.48 },
    ],
  },
  anthropic: {
    'claude-3-5-sonnet': [
      { upTo: 5_000_000, inputRate: 3.00, outputRate: 15.00 },
      { upTo: 50_000_000, inputRate: 2.70, outputRate: 13.50 },
      { upTo: Infinity, inputRate: 2.40, outputRate: 12.00 },
    ],
  },
};

/**
 * Prompt Caching Discounts by Provider
 * Cache write adds overhead; cache hit provides steep discount
 * @constant {Object}
 */
const PROMPT_CACHING_DISCOUNTS = {
  anthropic: {
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.10,
  },
  openai: {
    cacheReadMultiplier: 0.50,
  },
};

/**
 * Creates and validates a new commitment record
 *
 * Validates all required fields, computes amortization, initializes
 * consumption tracking. Compatible with Supabase schema.
 *
 * @param {Object} commitment - Commitment data
 * @param {string} commitment.id - Unique commitment ID
 * @param {string} commitment.organizationId - Organization owning commitment
 * @param {string} commitment.provider - AI provider ('openai', 'anthropic', etc.)
 * @param {string} commitment.model - Specific model or null for provider-wide
 * @param {string} commitment.commitmentType - Type from COMMITMENT_TYPES
 * @param {number} commitment.committedAmount - Committed spend in cents
 * @param {number} commitment.committedUnits - Committed tokens/requests
 * @param {string} commitment.unitType - 'dollars', 'tokens', 'requests', 'model_units'
 * @param {number} commitment.discountRate - Discount % (0-100)
 * @param {number} commitment.commitmentRate - Fixed rate per unit
 * @param {string} commitment.periodStart - ISO 8601 date string
 * @param {string} commitment.periodEnd - ISO 8601 date string
 * @param {string} commitment.billingFrequency - 'monthly', 'annual', 'upfront'
 * @param {number} commitment.totalCost - Total commitment cost in cents
 * @returns {Object|null} Validated and enriched commitment, or null if invalid
 * @throws {TypeError} Invalid inputs
 */
function createCommitment(commitment) {
  if (!commitment || typeof commitment !== 'object') {
    throw new TypeError('Commitment must be an object');
  }

  const required = [
    'id',
    'organizationId',
    'provider',
    'commitmentType',
    'periodStart',
    'periodEnd',
    'totalCost',
  ];
  for (const field of required) {
    if (!(field in commitment)) {
      throw new TypeError(`Missing required field: ${field}`);
    }
  }

  const validTypes = Object.values(COMMITMENT_TYPES);
  if (!validTypes.includes(commitment.commitmentType)) {
    throw new TypeError(`Invalid commitmentType: ${commitment.commitmentType}`);
  }

  const startDate = new Date(commitment.periodStart);
  const endDate = new Date(commitment.periodEnd);

  if (startDate >= endDate) {
    throw new Error('periodStart must be before periodEnd');
  }

  // Create enriched commitment record
  const enriched = {
    ...commitment,
    status: commitment.status || COMMITMENT_STATUS.ACTIVE,
    consumed: commitment.consumed || 0,
    remaining: commitment.remaining || commitment.committedUnits || commitment.committedAmount || 0,
    utilizationPct: commitment.utilizationPct || 0,
    createdAt: commitment.createdAt || new Date().toISOString(),
    updatedAt: commitment.updatedAt || new Date().toISOString(),
    metadata: commitment.metadata || {},
  };

  // Compute amortization
  const amortization = calculateAmortization(enriched);
  enriched.dailyAmortizedCost = amortization.dailyAmortizedCost;
  enriched.monthlyAmortizedCost = amortization.monthlyAmortizedCost;

  return enriched;
}

/**
 * Computes daily and monthly amortized cost for a commitment
 *
 * For upfront or reserved capacity payments, spreads cost across
 * commitment period. Handles partial periods (pro-rata).
 *
 * @param {Object} commitment - Commitment record with periodStart, periodEnd, totalCost
 * @returns {Object} { dailyAmortizedCost, monthlyAmortizedCost, daysInPeriod }
 */
function calculateAmortization(commitment) {
  const startDate = new Date(commitment.periodStart);
  const endDate = new Date(commitment.periodEnd);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysInPeriod = Math.ceil((endDate - startDate) / msPerDay);
  const monthsInPeriod = Math.max(1, Math.round(daysInPeriod / 30.44));

  const totalCostCents = commitment.totalCost || 0;

  return {
    dailyAmortizedCost: totalCostCents / Math.max(1, daysInPeriod),
    monthlyAmortizedCost: totalCostCents / Math.max(1, monthsInPeriod),
    daysInPeriod,
    monthsInPeriod,
  };
}

/**
 * Retrieves active, non-expired commitments for a provider/model
 *
 * Filters commitment list by:
 * - Status is ACTIVE
 * - Current date is within periodStart/periodEnd
 * - Provider matches (exact match)
 * - Model matches (null = provider-wide, otherwise exact match)
 *
 * @param {Array<Object>} allCommitments - All commitment records
 * @param {string} provider - Provider name ('openai', 'anthropic', etc.)
 * @param {string} model - Model name (may be null)
 * @param {Date} currentDate - Reference date for expiration check
 * @returns {Array<Object>} Filtered active commitments
 */
function getActiveCommitments(allCommitments, provider, model, currentDate = new Date()) {
  if (!Array.isArray(allCommitments)) {
    return [];
  }

  return allCommitments.filter((c) => {
    if (c.status !== COMMITMENT_STATUS.ACTIVE) return false;

    const now = currentDate.getTime();
    const start = new Date(c.periodStart).getTime();
    const end = new Date(c.periodEnd).getTime();

    if (now < start || now > end) return false;
    if (c.provider !== provider) return false;
    if (c.model !== null && c.model !== model) return false;

    return true;
  });
}

/**
 * Calculates effective cost after applying commitment discounts
 *
 * Main pricing function. Determines which commitment applies, calculates
 * discount/rate, and returns FOCUS-compatible pricing breakdown.
 *
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @param {Array<Object>} commitments - Active commitment records
 * @param {Object} listPricing - Baseline pricing { provider: { model: { input, output } } }
 * @returns {Object} Cost breakdown
 */
function calculateEffectiveCost(
  provider,
  model,
  inputTokens,
  outputTokens,
  commitments,
  listPricing
) {
  if (!listPricing || !listPricing[provider] || !listPricing[provider][model]) {
    throw new Error(`No list pricing found for ${provider}/${model}`);
  }

  const listPricingRate = listPricing[provider][model];
  const baseListCost =
    inputTokens * listPricingRate.input + outputTokens * listPricingRate.output;

  const activeCommitments = getActiveCommitments(commitments, provider, model);

  if (activeCommitments.length === 0) {
    return {
      listCost: baseListCost,
      effectiveCost: baseListCost,
      commitmentId: null,
      commitmentType: null,
      savings: 0,
      overageAmount: 0,
      focusCommitmentStatus: 'Unused',
    };
  }

  // Use first matching commitment (prioritize by specificity)
  const commitment = activeCommitments[0];

  let effectiveCost = baseListCost;
  let savings = 0;
  let overageAmount = 0;
  let focusStatus = 'Used';

  switch (commitment.commitmentType) {
    case COMMITMENT_TYPES.RESERVED_CAPACITY:
      // Fixed daily rate regardless of usage
      const amort = calculateAmortization(commitment);
      effectiveCost = amort.dailyAmortizedCost;
      savings = Math.max(0, baseListCost - effectiveCost);
      break;

    case COMMITMENT_TYPES.COMMITTED_USE: {
      // Apply discount rate while within committed units
      const totalTokens = inputTokens + outputTokens;
      const remaining = commitment.remaining || 0;

      if (totalTokens <= remaining) {
        const discountMultiplier = 1 - commitment.discountRate / 100;
        effectiveCost = baseListCost * discountMultiplier;
        savings = baseListCost - effectiveCost;
      } else {
        // Partial discount: discounted portion + overage at list
        const discountedTokens = remaining;
        const overageTokens = totalTokens - remaining;
        const avgInputRate =
          inputTokens > 0 ? listPricingRate.input : 0;
        const avgOutputRate =
          outputTokens > 0 ? listPricingRate.output : 0;
        const avgRate = (avgInputRate + avgOutputRate) / 2;

        const discountMultiplier = 1 - commitment.discountRate / 100;
        const discountedCost = discountedTokens * avgRate * discountMultiplier;
        overageAmount = overageTokens * avgRate;
        effectiveCost = discountedCost + overageAmount;
        savings = baseListCost - effectiveCost;
        focusStatus = 'Partial';
      }
      break;
    }

    case COMMITMENT_TYPES.VOLUME_DISCOUNT: {
      // Apply tier rate based on cumulative usage
      const cumulativeTokens = commitment.consumed + inputTokens + outputTokens;
      const tier = getVolumeTier(provider, model, cumulativeTokens);

      if (tier) {
        effectiveCost =
          inputTokens * (tier.inputRate / 100) +
          outputTokens * (tier.outputRate / 100);
        savings = baseListCost - effectiveCost;
      }
      break;
    }

    case COMMITMENT_TYPES.SAVINGS_PLAN: {
      // Apply commitment rate while $ remaining
      const commitmentRate = commitment.commitmentRate || 0;
      const remaining = commitment.remaining || 0;

      if (baseListCost <= remaining) {
        effectiveCost = baseListCost * (commitmentRate / 100);
        savings = baseListCost - effectiveCost;
      } else {
        const discountedCost = remaining * (commitmentRate / 100);
        overageAmount = (baseListCost - remaining) * 1.0; // list price for overage
        effectiveCost = discountedCost + overageAmount;
        savings = baseListCost - effectiveCost;
        focusStatus = 'Partial';
      }
      break;
    }

    case COMMITMENT_TYPES.PROMPT_CACHING: {
      // Apply caching discount (typically 10-50% off for cached)
      const cacheDiscount = PROMPT_CACHING_DISCOUNTS[provider];
      if (cacheDiscount) {
        const cacheReadMultiplier = cacheDiscount.cacheReadMultiplier || 0.1;
        effectiveCost = baseListCost * cacheReadMultiplier;
        savings = baseListCost - effectiveCost;
      }
      break;
    }

    case COMMITMENT_TYPES.ENTERPRISE_AGREEMENT: {
      // Custom negotiated rate
      const customRate = commitment.commitmentRate || 100;
      effectiveCost = baseListCost * (customRate / 100);
      savings = baseListCost - effectiveCost;
      break;
    }

    default:
      break;
  }

  return {
    listCost: baseListCost,
    effectiveCost: Math.max(0, effectiveCost),
    commitmentId: commitment.id,
    commitmentType: commitment.commitmentType,
    savings: Math.max(0, savings),
    overageAmount: Math.max(0, overageAmount),
    focusCommitmentStatus: focusStatus,
    discountRate: commitment.discountRate || 0,
  };
}

/**
 * Finds the applicable volume tier for cumulative token usage
 *
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number} cumulativeTokens - Total tokens used so far
 * @returns {Object|null} Tier object { upTo, inputRate, outputRate } or null
 */
function getVolumeTier(provider, model, cumulativeTokens) {
  const tiers = DEFAULT_VOLUME_TIERS[provider]?.[model];
  if (!tiers) return null;

  for (const tier of tiers) {
    if (cumulativeTokens <= tier.upTo) {
      return tier;
    }
  }

  return tiers[tiers.length - 1] || null;
}

/**
 * Applies prompt caching discount to token cost
 *
 * Handles cache write penalty and cache read discount per provider rules.
 *
 * @param {string} provider - Provider name ('anthropic', 'openai', etc.)
 * @param {string} model - Model name
 * @param {number} tokens - Token count
 * @param {boolean} isCacheHit - Whether this uses cached tokens
 * @param {boolean} isCacheWrite - Whether this populates cache
 * @param {number} listRate - Base rate per token (cents)
 * @returns {number} Effective cost in cents
 */
function calculateCachedCost(
  provider,
  model,
  tokens,
  isCacheHit,
  isCacheWrite,
  listRate
) {
  const discounts = PROMPT_CACHING_DISCOUNTS[provider];
  if (!discounts) {
    return tokens * listRate;
  }

  let multiplier = 1.0;

  if (isCacheWrite && discounts.cacheWriteMultiplier) {
    multiplier = discounts.cacheWriteMultiplier;
  } else if (isCacheHit && discounts.cacheReadMultiplier) {
    multiplier = discounts.cacheReadMultiplier;
  }

  return tokens * listRate * multiplier;
}

/**
 * Updates commitment consumption after a request
 *
 * Increments consumed, decrements remaining, recalculates utilization.
 * Tracks overage separately. Suitable for periodic batch updates or
 * per-request tracking with Supabase.
 *
 * @param {string} commitmentId - ID of commitment to update
 * @param {number} amount - Amount consumed (tokens, dollars, etc.)
 * @param {Array<Object>} commitments - All commitment records
 * @returns {Object} { updatedCommitment, overageAmount, utilizationPct }
 */
function trackConsumption(commitmentId, amount, commitments = []) {
  const commitment = commitments.find((c) => c.id === commitmentId);
  if (!commitment) {
    return { updatedCommitment: null, overageAmount: 0, utilizationPct: 0 };
  }

  const committed = commitment.committedUnits || commitment.committedAmount || 0;
  const consumed = (commitment.consumed || 0) + amount;
  const overage = Math.max(0, consumed - committed);
  const remaining = Math.max(0, committed - consumed);
  const utilizationPct =
    committed > 0 ? Math.round((consumed / committed) * 10000) / 100 : 0;

  const updated = {
    ...commitment,
    consumed,
    remaining,
    utilizationPct,
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedCommitment: updated,
    overageAmount: overage,
    utilizationPct,
  };
}

/**
 * Analyzes commitment utilization and projects end-of-period status
 *
 * For each active commitment, computes:
 * - Current utilization %
 * - Projected utilization if usage continues at current pace
 * - Waste (committed but unused capacity)
 * - Status recommendation
 *
 * @param {Array<Object>} commitments - All commitment records
 * @param {Date} currentDate - Reference date
 * @returns {Array<Object>} Utilization analysis per commitment
 */
function getCommitmentUtilization(commitments, currentDate = new Date()) {
  return commitments.map((c) => {
    const committed = c.committedUnits || c.committedAmount || 1;
    const consumed = c.consumed || 0;
    const utilizationPct = Math.round((consumed / committed) * 10000) / 100;

    const periodStart = new Date(c.periodStart);
    const periodEnd = new Date(c.periodEnd);
    const now = currentDate;

    const totalMs = periodEnd - periodStart;
    const elapsedMs = now - periodStart;
    const progressPct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));

    const dailyConsumption = consumed > 0 ? consumed / Math.max(1, elapsedMs / (24 * 60 * 60 * 1000)) : 0;
    const projectedConsumption = dailyConsumption * (totalMs / (24 * 60 * 60 * 1000));
    const projectedUtilizationPct = Math.round((projectedConsumption / committed) * 10000) / 100;

    const waste = Math.max(0, committed - projectedConsumption);

    let status = 'on_track';
    if (projectedUtilizationPct < 50) {
      status = 'under_utilizing';
    } else if (projectedConsumption > committed * 1.1) {
      status = 'over_committed';
    } else if (progressPct > 80) {
      status = 'expiring_soon';
    }

    return {
      commitmentId: c.id,
      currentUtilizationPct: utilizationPct,
      projectedUtilizationPct,
      progressPct: Math.round(progressPct * 100) / 100,
      projectedWaste: waste,
      status,
      recommendation:
        status === 'under_utilizing'
          ? 'Consider downsizing this commitment'
          : status === 'over_committed'
            ? 'Consider increasing commitment size'
            : status === 'expiring_soon'
              ? 'Commitment expires soon; consider renewal'
              : 'Utilization on track',
    };
  });
}

/**
 * Recommends new or modified commitments based on usage history
 *
 * Analyzes historical spending patterns and suggests:
 * - New commitments that would save money
 * - Upsizing under-committed agreements
 * - Downsizing over-committed agreements
 *
 * @param {Array<Object>} usageHistory - Historical usage records
 * @param {Array<Object>} currentCommitments - Existing commitments
 * @returns {Array<Object>} Recommendations with projected savings
 */
function recommendCommitments(usageHistory = [], currentCommitments = []) {
  if (usageHistory.length === 0) {
    return [];
  }

  const recommendations = [];

  // Analyze usage by provider/model
  const usageByModel = {};
  for (const record of usageHistory) {
    const key = `${record.provider}/${record.model}`;
    if (!usageByModel[key]) {
      usageByModel[key] = {
        provider: record.provider,
        model: record.model,
        totalCost: 0,
        tokenCount: 0,
        recordCount: 0,
      };
    }
    usageByModel[key].totalCost += record.cost || 0;
    usageByModel[key].tokenCount += (record.inputTokens || 0) + (record.outputTokens || 0);
    usageByModel[key].recordCount += 1;
  }

  // For each high-volume model, recommend commitment
  for (const key in usageByModel) {
    const usage = usageByModel[key];

    // Only recommend if > 1M tokens in history
    if (usage.tokenCount < 1_000_000) continue;

    const existingCommitment = currentCommitments.find(
      (c) => c.provider === usage.provider && c.model === usage.model
    );

    if (!existingCommitment) {
      // Recommend new commitment
      const monthlyAvgSpend = usage.totalCost / Math.max(1, usage.recordCount / 30);
      const projectedSavings = monthlyAvgSpend * 0.20; // Assume 20% savings with commitment

      recommendations.push({
        action: 'create_commitment',
        provider: usage.provider,
        model: usage.model,
        currentMonthlySpend: monthlyAvgSpend,
        projectedSavings,
        confidence: usage.tokenCount > 10_000_000 ? 0.95 : 0.75,
        reasoning: `High consistent usage (${usage.tokenCount.toLocaleString()} tokens). Commitment would likely save ${Math.round(projectedSavings)}¢/month.`,
      });
    }
  }

  // Review existing commitments for upsizing/downsizing
  for (const commitment of currentCommitments) {
    const utilization = getCommitmentUtilization([commitment])[0];
    if (!utilization) continue;

    if (utilization.status === 'under_utilizing') {
      recommendations.push({
        action: 'downsize_commitment',
        commitmentId: commitment.id,
        provider: commitment.provider,
        model: commitment.model,
        currentSize: commitment.committedUnits || commitment.committedAmount,
        projectedSize: Math.round((commitment.consumed || 0) * 1.1),
        confidence: 0.85,
        reasoning: `Utilization projected at ${utilization.projectedUtilizationPct}%. Consider reducing commitment to save on unused capacity.`,
      });
    } else if (utilization.status === 'over_committed') {
      recommendations.push({
        action: 'upsize_commitment',
        commitmentId: commitment.id,
        provider: commitment.provider,
        model: commitment.model,
        currentSize: commitment.committedUnits || commitment.committedAmount,
        projectedSize: Math.round((commitment.consumed || 0) * 1.2),
        confidence: 0.80,
        reasoning: `Projected overages. Consider increasing commitment to ${Math.round((commitment.consumed || 0) * 1.2)} units.`,
      });
    }
  }

  return recommendations;
}

/**
 * Converts cost calculation result to FOCUS 1.3 pricing fields
 *
 * Maps internal pricing results to standardized columns per
 * FinOps Open Cost and Usage Specification (FOCUS) 1.3
 *
 * @param {Object} costResult - Output of calculateEffectiveCost
 * @returns {Object} FOCUS-compatible pricing fields
 */
function toFOCUSPricing(costResult) {
  if (!costResult) {
    return {
      EffectiveCost: 0,
      ListCost: 0,
      CommitmentDiscountStatus: 'Unused',
      BilledCost: 0,
      AmortizedCost: 0,
    };
  }

  return {
    ListCost: Math.round(costResult.listCost) / 100,
    EffectiveCost: Math.round(costResult.effectiveCost) / 100,
    CommitmentDiscountStatus: costResult.focusCommitmentStatus || 'Unused',
    BilledCost: Math.round(costResult.effectiveCost) / 100,
    AmortizedCost: Math.round(costResult.effectiveCost) / 100,
    Savings: Math.round(costResult.savings) / 100,
  };
}

/**
 * Resets period consumption if period has rolled over
 *
 * For monthly/annual commitments, checks if current date > periodEnd.
 * If so: resets consumed/remaining, updates period dates.
 * Does NOT carry over unused capacity.
 *
 * @param {Array<Object>} commitments - All commitment records
 * @param {Date} currentDate - Reference date
 * @returns {Array<Object>} Updated commitments
 */
function resetPeriodConsumption(commitments = [], currentDate = new Date()) {
  return commitments.map((c) => {
    const periodEnd = new Date(c.periodEnd);

    if (currentDate <= periodEnd) {
      // Period not expired yet
      return c;
    }

    // Period expired; calculate new period dates based on frequency
    let newStart = new Date(periodEnd);
    let newEnd = new Date(periodEnd);

    if (c.billingFrequency === 'monthly') {
      newStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);
      newEnd = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 2, 1);
    } else if (c.billingFrequency === 'annual') {
      newStart = new Date(periodEnd.getFullYear() + 1, periodEnd.getMonth(), periodEnd.getDate());
      newEnd = new Date(periodEnd.getFullYear() + 2, periodEnd.getMonth(), periodEnd.getDate());
    } else {
      // For 'upfront' or undefined, don't auto-reset
      return c;
    }

    // Reset consumption; commitment amounts don't roll over
    return {
      ...c,
      consumed: 0,
      remaining: c.committedUnits || c.committedAmount || 0,
      utilizationPct: 0,
      periodStart: newStart.toISOString(),
      periodEnd: newEnd.toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

/**
 * Generates comprehensive savings report
 *
 * Analyzes all commitments and usage to produce savings intelligence:
 * - Total cost with/without commitments
 * - Savings breakdown by commitment type
 * - Wasted (paid but unused) capacity
 * - Net savings (savings - waste)
 * - Optimization recommendations
 *
 * @param {Array<Object>} commitments - All commitment records
 * @param {Array<Object>} usageRecords - Cost records with listCost, effectiveCost
 * @param {Object} period - { startDate, endDate }
 * @returns {Object} Comprehensive savings analysis
 */
function calculateSavingsReport(commitments = [], usageRecords = [], period = {}) {
  const startDate = new Date(period.startDate || Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date(period.endDate || Date.now());

  // Filter usage records within period
  const relevantRecords = usageRecords.filter((r) => {
    if (!r.timestamp) return true;
    const ts = new Date(r.timestamp);
    return ts >= startDate && ts <= endDate;
  });

  let totalListCost = 0;
  let totalEffectiveCost = 0;
  let savingsByType = {};

  for (const record of relevantRecords) {
    totalListCost += record.listCost || 0;
    totalEffectiveCost += record.effectiveCost || 0;

    if (record.commitmentType) {
      if (!savingsByType[record.commitmentType]) {
        savingsByType[record.commitmentType] = 0;
      }
      savingsByType[record.commitmentType] +=
        (record.listCost || 0) - (record.effectiveCost || 0);
    }
  }

  // Calculate amortized commitment costs
  let totalCommitmentCost = 0;
  for (const commitment of commitments) {
    const cStart = new Date(commitment.periodStart);
    const cEnd = new Date(commitment.periodEnd);

    if (cStart < endDate && cEnd > startDate) {
      const amort = calculateAmortization(commitment);
      const daysInRange = Math.ceil((Math.min(cEnd, endDate) - Math.max(cStart, startDate)) / (24 * 60 * 60 * 1000));
      totalCommitmentCost += amort.dailyAmortizedCost * daysInRange;
    }
  }

  const totalSavings = totalListCost - totalEffectiveCost;
  const waste = totalCommitmentCost - totalSavings;
  const netSavings = totalSavings - Math.max(0, waste);

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    totalListCost: Math.round(totalListCost) / 100,
    totalEffectiveCost: Math.round(totalEffectiveCost) / 100,
    totalAmortizedCommitmentCost: Math.round(totalCommitmentCost) / 100,
    totalSavings: Math.round(totalSavings) / 100,
    savingsByCommitmentType: Object.fromEntries(
      Object.entries(savingsByType).map(([type, amount]) => [
        type,
        Math.round(amount) / 100,
      ])
    ),
    wastedCapacity: Math.round(Math.max(0, waste)) / 100,
    netSavings: Math.round(netSavings) / 100,
    savingsRate: totalListCost > 0 ? Math.round((totalSavings / totalListCost) * 10000) / 100 : 0,
    recommendations: recommendCommitments(relevantRecords, commitments),
  };
}

/**
 * Module Exports
 * All public API for commitment pricing calculations
 */
module.exports = {
  // Constants & Enums
  COMMITMENT_TYPES,
  COMMITMENT_STATUS,
  DEFAULT_VOLUME_TIERS,
  PROMPT_CACHING_DISCOUNTS,

  // Core Functions
  createCommitment,
  calculateEffectiveCost,
  calculateAmortization,
  trackConsumption,
  calculateCachedCost,
  getCommitmentUtilization,
  recommendCommitments,
  toFOCUSPricing,
  resetPeriodConsumption,
  getActiveCommitments,
  calculateSavingsReport,

  // Helpers
  getVolumeTier,
};
