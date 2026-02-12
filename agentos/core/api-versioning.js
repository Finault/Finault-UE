/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT API VERSIONING AND DEPRECATION POLICY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Gap #10: API Versioning and Deprecation Policy — MEDIUM / P3
 *
 * Problem: API has only /api/v1/* routes. No versioning strategy means any breaking
 * change breaks all clients. No deprecation headers, no backward compatibility layer.
 *
 * This module provides:
 * - Version registry with supported/deprecated/sunset status per version
 * - Deprecation header injection (Sunset, Deprecation, Link headers per RFC 8594)
 * - Backward compatibility layer (transform v1 request → v2 format)
 * - Version extraction from URL path, query param, or Accept header
 * - Breaking change detection helper
 * - Migration guide generator
 *
 * Versioning Rules:
 * 1. URL path versioning: /api/v1/*, /api/v2/*
 * 2. Minimum 6-month deprecation notice before sunset
 * 3. Deprecation response headers: Deprecation + Sunset + Link (RFC 8594)
 * 4. Backward compatibility: v2 accepts v1 format with auto-transformation
 * 5. Breaking changes: field removal, type change, required field addition, removal
 * 6. Non-breaking: new optional fields, new endpoints, new enum values
 *
 * Version Definitions:
 * - v1: status='supported', sunset=null (current stable)
 * - v2: status='planned', features=[batch_operations, streaming, field_selection]
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from './structured-logger.js';

const logger = createLogger('api-versioning');

// ─── API Version Registry ────────────────────────────────────────────────────

export const API_VERSIONS = {
    v1: {
        version: 'v1',
        status: 'supported',
        releaseDate: '2024-01-15',
        deprecationDate: null,
        sunsetDate: null,
        features: ['basic_operations', 'simple_queries'],
        description: 'Current stable API version with core operations',
        notes: 'All clients currently supported on this version'
    },
    v2: {
        version: 'v2',
        status: 'planned',
        releaseDate: '2024-08-01',
        deprecationDate: null,
        sunsetDate: null,
        features: ['batch_operations', 'streaming', 'field_selection'],
        description: 'Next generation API with enhanced capabilities',
        notes: 'Planned release Q3 2024. Will include breaking changes for improved design.',
        breakingChanges: [
            'Response envelope structure simplified',
            'Pagination changed from offset/limit to cursor-based',
            'Field selection replaces query projections'
        ]
    }
};

/**
 * Get version definition by version string
 * @param {string} versionString - e.g., 'v1', 'v2'
 * @returns {Object|null} Version definition or null
 */
export function getVersionDefinition(versionString) {
    return API_VERSIONS[versionString] || null;
}

/**
 * Get all supported (non-sunset) versions
 * @returns {Object[]} Array of supported versions
 */
export function getSupportedVersions() {
    return Object.values(API_VERSIONS).filter(v => !v.sunsetDate);
}

/**
 * Check if a version is deprecated
 * @param {string} versionString
 * @returns {boolean}
 */
export function isDeprecated(versionString) {
    const def = getVersionDefinition(versionString);
    return def?.status === 'deprecated' && def?.deprecationDate !== null;
}

/**
 * Check if a version is sunset (no longer supported)
 * @param {string} versionString
 * @returns {boolean}
 */
export function isSunset(versionString) {
    const def = getVersionDefinition(versionString);
    return def?.status === 'sunset' && def?.sunsetDate !== null;
}

// ─── Version Extraction ──────────────────────────────────────────────────────

/**
 * Extract API version from request using multiple strategies:
 * 1. URL path: /api/v1/*, /api/v2/*
 * 2. Query parameter: ?api-version=v1
 * 3. Accept header: application/vnd.finault+json;version=v1
 *
 * @param {Object} request - Request object with url, headers, query
 * @returns {string} Version string (e.g., 'v1') or 'v1' as default
 */
export function extractVersion(request) {
    // Strategy 1: URL path versioning
    const urlMatch = request.url?.match(/\/api\/(v\d+)\//);
    if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
    }

    // Strategy 2: Query parameter
    const queryVersion = request.query?.['api-version'] || request.query?.version;
    if (queryVersion && getVersionDefinition(queryVersion)) {
        return queryVersion;
    }

    // Strategy 3: Accept header (RFC 8596)
    const acceptHeader = request.headers?.accept || request.headers?.Accept || '';
    const acceptMatch = acceptHeader.match(/version\s*=\s*(v\d+)/i);
    if (acceptMatch && acceptMatch[1] && getVersionDefinition(acceptMatch[1])) {
        return acceptMatch[1];
    }

    // Default to v1
    return 'v1';
}

// ─── Deprecation Header Injection ────────────────────────────────────────────

/**
 * Generate deprecation headers following RFC 8594
 * https://datatracker.ietf.org/doc/html/rfc8594
 *
 * @param {string} versionString - e.g., 'v1'
 * @param {Object} [options] - { migrationGuideUrl, context }
 * @returns {Object} Headers to inject in response
 */
export function getDeprecationHeaders(versionString, options = {}) {
    const def = getVersionDefinition(versionString);
    const headers = {};

    if (!def || !isDeprecated(versionString)) {
        return headers;
    }

    logger.warn('Deprecated API version accessed', {
        version: versionString,
        deprecationDate: def.deprecationDate,
        sunsetDate: def.sunsetDate,
        status: def.status
    });

    // Deprecation: true (RFC 8594)
    headers['Deprecation'] = 'true';

    // Sunset: <HTTP-date> (RFC 8594)
    if (def.sunsetDate) {
        const sunsetDate = new Date(def.sunsetDate);
        headers['Sunset'] = sunsetDate.toUTCString();
    }

    // Link: <migration_url>; rel="deprecation" (RFC 8594)
    const migrationGuideUrl = options.migrationGuideUrl ||
        `https://docs.finault.io/api/migration/${versionString}`;
    headers['Link'] = `<${migrationGuideUrl}>; rel="deprecation"`;

    return headers;
}

/**
 * Inject deprecation headers into response
 * @param {Object} response - HTTP response object
 * @param {string} versionString
 * @param {Object} [options]
 * @returns {Object} Modified response
 */
export function withDeprecationHeaders(response, versionString, options = {}) {
    const deprecationHeaders = getDeprecationHeaders(versionString, options);
    if (Object.keys(deprecationHeaders).length === 0) {
        return response;
    }

    return {
        ...response,
        headers: {
            ...(response.headers || {}),
            ...deprecationHeaders
        }
    };
}

// ─── Breaking Change Detection ──────────────────────────────────────────────

export const BREAKING_CHANGE_TYPES = {
    FIELD_REMOVAL: 'field_removal',
    TYPE_CHANGE: 'type_change',
    REQUIRED_FIELD_ADDITION: 'required_field_addition',
    ENDPOINT_REMOVAL: 'endpoint_removal',
    ENUM_VALUE_REMOVAL: 'enum_value_removal',
    PAGINATION_CHANGE: 'pagination_change'
};

/**
 * Detect if a change is breaking
 * @param {Object} change - { type, field, oldType, newType, ... }
 * @returns {boolean}
 */
export function isBreakingChange(change) {
    if (!change || !change.type) {
        return false;
    }

    const breakingTypes = Object.values(BREAKING_CHANGE_TYPES);
    return breakingTypes.includes(change.type);
}

/**
 * Describe a breaking change in human-readable format
 * @param {Object} change
 * @returns {string} Description
 */
export function describeBreakingChange(change) {
    switch (change.type) {
        case BREAKING_CHANGE_TYPES.FIELD_REMOVAL:
            return `Field '${change.field}' removed from '${change.endpoint}'`;
        case BREAKING_CHANGE_TYPES.TYPE_CHANGE:
            return `Field '${change.field}' type changed from '${change.oldType}' to '${change.newType}' in '${change.endpoint}'`;
        case BREAKING_CHANGE_TYPES.REQUIRED_FIELD_ADDITION:
            return `Required field '${change.field}' added to '${change.endpoint}' request`;
        case BREAKING_CHANGE_TYPES.ENDPOINT_REMOVAL:
            return `Endpoint '${change.endpoint}' removed`;
        case BREAKING_CHANGE_TYPES.ENUM_VALUE_REMOVAL:
            return `Enum value '${change.oldValue}' removed from '${change.field}'`;
        case BREAKING_CHANGE_TYPES.PAGINATION_CHANGE:
            return `Pagination format changed from '${change.oldFormat}' to '${change.newFormat}'`;
        default:
            return `Unknown breaking change: ${JSON.stringify(change)}`;
    }
}

// ─── Backward Compatibility Layer ────────────────────────────────────────────

/**
 * Transform v1 request format to v2 format
 * Used when client sends v1-format request but server handles v2
 *
 * @param {Object} requestBody - Client request (v1 format)
 * @returns {Object} Transformed request (v2 format)
 */
export function transformV1RequestToV2(requestBody) {
    if (!requestBody) return requestBody;

    const transformed = { ...requestBody };

    // Handle pagination transformation: offset/limit → cursor
    if ('offset' in transformed || 'limit' in transformed) {
        const offset = transformed.offset || 0;
        const limit = transformed.limit || 50;

        transformed.pagination = {
            cursor: null, // Client can provide initial cursor
            limit: limit
        };

        delete transformed.offset;
        delete transformed.limit;
    }

    // Handle projection transformation: fields → fieldSelection
    if ('fields' in transformed) {
        transformed.fieldSelection = transformed.fields;
        delete transformed.fields;
    }

    // Handle filters transformation: simplify nested structure if needed
    if (transformed.filters && typeof transformed.filters === 'object') {
        // v2 simplifies filter structure - flatten if needed
        // (implementation depends on actual schema)
    }

    return transformed;
}

/**
 * Transform v2 response format to v1 format
 * Used when client requested v1 but server returns v2
 *
 * @param {Object} responseBody - Server response (v2 format)
 * @returns {Object} Transformed response (v1 format)
 */
export function transformV2ResponseToV1(responseBody) {
    if (!responseBody) return responseBody;

    const transformed = { ...responseBody };

    // Handle pagination transformation: cursor → offset/limit
    if (transformed.pagination) {
        const { cursor, limit } = transformed.pagination;

        // Attempt to extract offset from cursor (depends on cursor format)
        const offset = cursor ? parseInt(cursor.split('_')[1] || 0) : 0;

        transformed.offset = offset;
        transformed.limit = limit || 50;
        delete transformed.pagination;
    }

    // Handle fieldSelection transformation: fieldSelection → fields
    if ('fieldSelection' in transformed) {
        transformed.fields = transformed.fieldSelection;
        delete transformed.fieldSelection;
    }

    return transformed;
}

// ─── Migration Guide Generator ──────────────────────────────────────────────

/**
 * Generate a migration guide for moving from one version to another
 * @param {string} fromVersion - e.g., 'v1'
 * @param {string} toVersion - e.g., 'v2'
 * @returns {Object} Migration guide with breaking changes and examples
 */
export function generateMigrationGuide(fromVersion, toVersion) {
    const from = getVersionDefinition(fromVersion);
    const to = getVersionDefinition(toVersion);

    if (!from || !to) {
        return null;
    }

    const breakingChanges = to.breakingChanges || [];

    return {
        fromVersion,
        toVersion,
        summary: `Migration guide from ${fromVersion} to ${toVersion}`,
        breakingChanges: breakingChanges.map(change => ({
            title: typeof change === 'string' ? change : change.title,
            description: typeof change === 'string' ? null : change.description,
            mitigation: typeof change === 'string' ? null : change.mitigation
        })),
        examples: {
            paginationBefore: {
                request: { offset: 0, limit: 50 },
                response: { offset: 0, limit: 50, total: 1000, data: [] }
            },
            paginationAfter: {
                request: { pagination: { cursor: null, limit: 50 } },
                response: { pagination: { cursor: 'cursor_50', limit: 50 }, hasMore: true, data: [] }
            },
            fieldSelectionBefore: {
                request: { fields: ['id', 'name', 'email'] }
            },
            fieldSelectionAfter: {
                request: { fieldSelection: ['id', 'name', 'email'] }
            }
        },
        timeline: {
            deprecationDate: from.deprecationDate,
            sunsetDate: from.sunsetDate,
            daysUntilSunset: from.sunsetDate ?
                Math.ceil((new Date(from.sunsetDate) - new Date()) / (1000 * 60 * 60 * 24)) :
                null
        },
        resources: {
            documentation: `https://docs.finault.io/api/versions/${toVersion}`,
            changelog: `https://docs.finault.io/api/changelog`,
            support: 'https://support.finault.io'
        }
    };
}

// ─── Version Manager Class ──────────────────────────────────────────────────

/**
 * Version manager utility for request/response handling
 */
export class VersionManager {
    /**
     * @param {Object} [config] - Configuration object
     * @param {string} [config.defaultVersion] - Default to use if not specified
     * @param {boolean} [config.strictMode] - Reject unsupported versions (vs fallback to v1)
     */
    constructor(config = {}) {
        this.defaultVersion = config.defaultVersion || 'v1';
        this.strictMode = config.strictMode || false;
    }

    /**
     * Resolve version from request
     * @param {Object} request
     * @returns {Object} { version, definition, isDeprecated, isSunset }
     */
    resolveVersion(request) {
        const version = extractVersion(request);
        const definition = getVersionDefinition(version);

        if (!definition) {
            if (this.strictMode) {
                throw new Error(`Unsupported API version: ${version}`);
            }
            // Fallback to default
            return this.resolveVersion({ ...request, url: `/api/${this.defaultVersion}/` });
        }

        return {
            version,
            definition,
            isDeprecated: isDeprecated(version),
            isSunset: isSunset(version)
        };
    }

    /**
     * Transform request to target version
     * @param {Object} requestBody
     * @param {string} fromVersion
     * @param {string} toVersion
     * @returns {Object} Transformed request
     */
    transformRequest(requestBody, fromVersion, toVersion) {
        if (fromVersion === toVersion) {
            return requestBody;
        }

        // v1 → v2
        if (fromVersion === 'v1' && toVersion === 'v2') {
            return transformV1RequestToV2(requestBody);
        }

        // v2 → v1 (downgrade)
        if (fromVersion === 'v2' && toVersion === 'v1') {
            return transformV2ResponseToV1(requestBody);
        }

        // Other transformations: return as-is
        return requestBody;
    }

    /**
     * Transform response to client version
     * @param {Object} responseBody
     * @param {string} internalVersion - Version API used internally
     * @param {string} clientVersion - Version client requested
     * @returns {Object} Transformed response
     */
    transformResponse(responseBody, internalVersion, clientVersion) {
        if (internalVersion === clientVersion) {
            return responseBody;
        }

        // v2 → v1
        if (internalVersion === 'v2' && clientVersion === 'v1') {
            return transformV2ResponseToV1(responseBody);
        }

        // v1 → v2 (upgrade response)
        if (internalVersion === 'v1' && clientVersion === 'v2') {
            return transformV1RequestToV2(responseBody);
        }

        // Other transformations: return as-is
        return responseBody;
    }

    /**
     * Get version info including deprecation status
     * @param {string} version
     * @returns {Object}
     */
    getVersionInfo(version) {
        const definition = getVersionDefinition(version);
        if (!definition) return null;

        return {
            ...definition,
            isDeprecated: isDeprecated(version),
            isSunset: isSunset(version),
            status: definition.status,
            sunsetDate: definition.sunsetDate,
            deprecationDate: definition.deprecationDate
        };
    }

    /**
     * Get all version info
     * @returns {Object[]}
     */
    getAllVersions() {
        return Object.keys(API_VERSIONS).map(v => this.getVersionInfo(v));
    }
}

/**
 * Factory function to create a VersionManager instance
 * @param {Object} [config]
 * @returns {VersionManager}
 */
export function createVersionManager(config = {}) {
    return new VersionManager(config);
}

// ─── Middleware Factories ────────────────────────────────────────────────────

/**
 * Create Hono middleware to handle API versioning
 *
 * @param {Object} [options]
 * @returns {Function} Middleware function
 */
export function createVersioningMiddleware(options = {}) {
    const manager = new VersionManager(options);

    return async (c, next) => {
        try {
            // Extract and validate version
            const versionInfo = manager.resolveVersion({
                url: c.req.url,
                headers: c.req.raw.headers,
                query: Object.fromEntries(new URL(c.req.url).searchParams)
            });

            // Attach to context for handlers
            c.set('apiVersion', versionInfo.version);
            c.set('versionInfo', versionInfo);

            // Add deprecation headers if needed
            if (versionInfo.isDeprecated) {
                const headers = getDeprecationHeaders(versionInfo.version, options);
                Object.entries(headers).forEach(([key, value]) => {
                    c.header(key, value);
                });
            }

            // Warn about sunset
            if (versionInfo.isSunset) {
                console.warn(`Request to sunset API version: ${versionInfo.version}`);
                return c.json({
                    success: false,
                    error: {
                        code: 'FINAULT-7003',
                        message: `API version ${versionInfo.version} is no longer supported`,
                        sunsetDate: versionInfo.definition.sunsetDate
                    }
                }, 410); // 410 Gone
            }

            await next();
        } catch (error) {
            console.error('Version middleware error:', error);
            return c.json({
                success: false,
                error: {
                    code: 'FINAULT-1001',
                    message: 'Invalid API version specified'
                }
            }, 400);
        }
    };
}

/**
 * Create middleware to transform request/response based on versions
 *
 * @param {Object} [options]
 * @returns {Function} Middleware function
 */
export function createCompatibilityMiddleware(options = {}) {
    const manager = new VersionManager(options);
    const internalVersion = options.internalVersion || 'v2';

    return async (c, next) => {
        const clientVersion = c.get('apiVersion') || 'v1';

        // Store original body
        const originalBody = c.req.raw.body;
        let parsedBody = {};

        if (originalBody) {
            try {
                parsedBody = JSON.parse(originalBody);
            } catch {
                // Not JSON, skip transformation
            }
        }

        // Transform incoming request if needed
        if (clientVersion !== internalVersion) {
            const transformed = manager.transformRequest(parsedBody, clientVersion, internalVersion);
            c.set('transformedRequest', transformed);
        }

        await next();

        // Transformation of response happens in response handler
        // (would need to wrap response body)
    };
}

// ─── Hono Route Handler Wrapper ──────────────────────────────────────────────

/**
 * Wrap a Hono route handler to add version support
 * Transforms request and response based on API version
 *
 * @param {Function} handler - Original handler (c) => Promise
 * @param {Object} [options]
 * @returns {Function} Wrapped handler
 */
export function withVersionSupport(handler, options = {}) {
    const manager = new VersionManager(options);
    const internalVersion = options.internalVersion || 'v2';

    return async (c) => {
        const clientVersion = c.get('apiVersion') || 'v1';

        try {
            // Call original handler
            const response = await handler(c);

            // Transform response if versions differ
            if (clientVersion !== internalVersion && response?.body) {
                try {
                    const body = typeof response.body === 'string' ?
                        JSON.parse(response.body) :
                        response.body;

                    const transformed = manager.transformResponse(body, internalVersion, clientVersion);

                    return {
                        ...response,
                        body: typeof response.body === 'string' ?
                            JSON.stringify(transformed) :
                            transformed
                    };
                } catch {
                    // Can't transform, return as-is
                }
            }

            return response;
        } catch (error) {
            throw error;
        }
    };
}

// ─── Export All Utilities ────────────────────────────────────────────────────

export default {
    API_VERSIONS,
    BREAKING_CHANGE_TYPES,
    // Registry
    getVersionDefinition,
    getSupportedVersions,
    isDeprecated,
    isSunset,
    // Extraction
    extractVersion,
    // Deprecation
    getDeprecationHeaders,
    withDeprecationHeaders,
    // Breaking changes
    isBreakingChange,
    describeBreakingChange,
    // Compatibility
    transformV1RequestToV2,
    transformV2ResponseToV1,
    // Migration
    generateMigrationGuide,
    // Manager
    VersionManager,
    createVersionManager,
    // Middleware
    createVersioningMiddleware,
    createCompatibilityMiddleware,
    withVersionSupport
};
