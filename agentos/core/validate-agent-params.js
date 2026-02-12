/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AGENT PARAMETER VALIDATION GUARD
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fix W-002: Prevents silent data corruption from positional argument misuse.
 *
 * THE PROBLEM:
 *   All agent constructors use named destructuring:
 *     constructor({ organizationId, userId, config = {} } = {})
 *
 *   But callers could accidentally pass positional args:
 *     new Agent(userId, orgId)           ← Destructures a string → all undefined
 *     new Agent(orgId)                   ← Same problem
 *     new Agent({ orgId, userId })       ← Wrong property names → both undefined
 *
 *   JavaScript does NOT throw an error in any of these cases — it silently
 *   assigns undefined to all properties. This causes downstream failures in
 *   Supabase queries, memory initialization, and cross-agent communication
 *   that are nearly impossible to trace back to a constructor bug.
 *
 * THE SOLUTION:
 *   Every agent constructor calls validateAgentParams() as its first line.
 *   This function:
 *     1. Detects positional string args (the most common mistake)
 *     2. Detects empty/missing params when at least orgId is required
 *     3. Detects misspelled property names (orgId vs organizationId)
 *     4. Returns the validated { organizationId, userId, config } tuple
 *
 * Usage:
 *   import { validateAgentParams } from '../core/validate-agent-params.js';
 *
 *   constructor(params) {
 *       const { organizationId, userId, config } = validateAgentParams(params, 'MyAgent');
 *       this.organizationId = organizationId;
 *       this.userId = userId;
 *       ...
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Common misspellings and abbreviations that callers might use
 * Maps wrong names to their canonical form
 */
const PARAM_ALIASES = {
    // organizationId aliases
    orgId: 'organizationId',
    org_id: 'organizationId',
    orgid: 'organizationId',
    organization_id: 'organizationId',
    organisationId: 'organizationId',
    organisation_id: 'organizationId',
    // userId aliases
    user_id: 'userId',
    userid: 'userId',
    uid: 'userId',
};

/**
 * Validate and normalize agent constructor parameters.
 *
 * @param {Object} params - The constructor argument (should be { organizationId, userId, config })
 * @param {string} agentName - Agent name for error messages
 * @param {Object} options - Validation options
 * @param {boolean} options.requireOrganizationId - Whether organizationId is required (default: true)
 * @param {boolean} options.requireUserId - Whether userId is required (default: false)
 * @returns {{ organizationId: string|null, userId: string|null, config: Object }}
 * @throws {TypeError} If positional args or invalid types are detected
 */
export function validateAgentParams(params, agentName = 'Agent', options = {}) {
    const {
        requireOrganizationId = true,
        requireUserId = false,
    } = options;

    // ── Guard 1: Detect positional string args ──────────────────────────
    // new Agent('org-123', 'user-456') → params = 'org-123' (a string)
    // Destructuring a string gives undefined for all named properties.
    if (typeof params === 'string') {
        throw new TypeError(
            `[${agentName}] Constructor received a positional string argument "${params.substring(0, 40)}...". ` +
            `Agent constructors require named parameters: new ${agentName}({ organizationId, userId }). ` +
            `Positional arguments cause silent data corruption and are not supported.`
        );
    }

    // ── Guard 2: Detect number/boolean/array positional args ────────────
    if (params !== null && params !== undefined && typeof params !== 'object') {
        throw new TypeError(
            `[${agentName}] Constructor received a ${typeof params} argument. ` +
            `Expected an object: new ${agentName}({ organizationId, userId }).`
        );
    }

    // ── Guard 3: Handle undefined/null (the = {} default should catch this,
    // but callers might explicitly pass null) ────────────────────────────
    if (params === null || params === undefined) {
        params = {};
    }

    // ── Guard 4: Detect and fix misspelled property names ───────────────
    const corrected = { ...params };
    const corrections = [];

    for (const [wrongName, rightName] of Object.entries(PARAM_ALIASES)) {
        if (corrected[wrongName] !== undefined && corrected[rightName] === undefined) {
            corrected[rightName] = corrected[wrongName];
            delete corrected[wrongName];
            corrections.push(`${wrongName} → ${rightName}`);
        }
    }

    if (corrections.length > 0) {
        console.warn(
            `[${agentName}] Auto-corrected parameter names: ${corrections.join(', ')}. ` +
            `Please use the canonical names: { organizationId, userId, config }.`
        );
    }

    // ── Extract canonical params ────────────────────────────────────────
    // CRITICAL: Use ?? (nullish coalescing) not || (logical OR).
    // With ||, falsy values like "" (empty string) silently become null,
    // bypassing Guard 6 type checks and causing silent data corruption.
    const organizationId = corrected.organizationId ?? null;
    const userId = corrected.userId ?? null;
    const config = corrected.config ?? {};

    // ── Guard 5: Type validation (runs BEFORE required-field check) ─────
    // Type validation must run first so that wrong-type values (0, false, "")
    // get a clear "must be a string" error instead of "is required."
    if (organizationId !== null && typeof organizationId !== 'string') {
        throw new TypeError(
            `[${agentName}] organizationId must be a string, got ${typeof organizationId}: ${JSON.stringify(organizationId)}.`
        );
    }

    if (userId !== null && typeof userId !== 'string') {
        throw new TypeError(
            `[${agentName}] userId must be a string, got ${typeof userId}: ${JSON.stringify(userId)}.`
        );
    }

    if (typeof config !== 'object' || Array.isArray(config)) {
        throw new TypeError(
            `[${agentName}] config must be a plain object, got ${Array.isArray(config) ? 'array' : typeof config}.`
        );
    }

    // ── Guard 6: Required field validation ──────────────────────────────
    // Uses strict null/undefined check (not falsy) so empty string "" passes
    // through to type validation above rather than being misidentified as missing.
    if (requireOrganizationId && (organizationId === null || organizationId === undefined)) {
        throw new TypeError(
            `[${agentName}] organizationId is required but was ${JSON.stringify(params.organizationId)}. ` +
            `Pass: new ${agentName}({ organizationId: 'org-xxx', userId: 'user-xxx' }).`
        );
    }

    if (requireUserId && (userId === null || userId === undefined)) {
        throw new TypeError(
            `[${agentName}] userId is required but was ${JSON.stringify(params.userId)}. ` +
            `Pass: new ${agentName}({ organizationId: 'org-xxx', userId: 'user-xxx' }).`
        );
    }

    // ── Freeze the validated result ──────────────────────────────────────
    // Prevents post-validation mutation: validated.organizationId = 'hacked'
    // Config is NOT frozen (agents need to modify their config at runtime),
    // but the top-level contract is immutable.
    return Object.freeze({ organizationId, userId, config });
}

export default validateAgentParams;
