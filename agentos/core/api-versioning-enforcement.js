/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT API VERSIONING ENFORCEMENT — Gap #10 Completion
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runtime middleware that ENFORCES API versioning:
 * - Rejects requests to sunset versions (410 Gone)
 * - Injects deprecation headers on deprecated versions (RFC 8594)
 * - Tracks version usage metrics for migration planning
 * - Schedules sunset notifications
 * - Provides V2 API router stub with batch operations
 *
 * This module implements:
 * - Version lifecycle management (planned → beta → supported → deprecated → sunset)
 * - Deprecation header injection (Deprecation, Sunset, Link headers)
 * - Grace period enforcement after sunset date
 * - Version usage tracking and migration progress reporting
 * - Sunset scheduler with notification timeline
 * - V2 API stub with batch operations support
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Configuration Constants ─────────────────────────────────────────────────

export const ENFORCEMENT_CONFIG = {
    strictSunset: true,              // Reject requests to sunset versions (true = hard reject)
    deprecationWarningHeader: true,  // Inject Deprecation + Sunset + Link headers
    sunsetGracePeriodDays: 30,      // Grace period after sunset date before hard rejection
    logDeprecatedUsage: true,        // Log each deprecated API call
    metricsEnabled: true,            // Track version usage metrics
    defaultVersion: 'v1',            // Default version if not specified
    allowUnversioned: false,         // Reject requests without version
    migrationGuideBaseUrl: 'https://docs.finault.com/api/migration'
};

export const VERSION_LIFECYCLE = {
    statuses: ['planned', 'beta', 'supported', 'deprecated', 'sunset'],
    transitions: {
        planned: ['beta'],
        beta: ['supported', 'sunset'],
        supported: ['deprecated'],
        deprecated: ['sunset'],
        sunset: [] // terminal state
    }
};

// ─── VersionRegistry Class ──────────────────────────────────────────────────

/**
 * Manages API version lifecycle: registration, status tracking, transitions
 */
export class VersionRegistry {
    constructor(versions = {}) {
        this.versions = versions;
    }

    /**
     * Register a new version
     * @param {string} version - Version identifier (e.g., 'v1', 'v2')
     * @param {Object} config - Version configuration
     */
    register(version, config) {
        this.versions[version] = {
            version,
            status: 'planned',
            releaseDate: new Date().toISOString(),
            deprecationDate: null,
            sunsetDate: null,
            features: [],
            ...config
        };
    }

    /**
     * Get version configuration
     * @param {string} version
     * @returns {Object|null}
     */
    get(version) {
        return this.versions[version] || null;
    }

    /**
     * Get status of a version
     * @param {string} version
     * @returns {string|null}
     */
    getStatus(version) {
        const v = this.get(version);
        return v ? v.status : null;
    }

    /**
     * Mark version as deprecated with sunset date
     * @param {string} version
     * @param {Date|string} sunsetDate - Must be 6+ months in the future
     * @throws {Error} if sunset date is less than 6 months away
     */
    deprecate(version, sunsetDate) {
        const v = this.get(version);
        if (!v) throw new Error(`Version ${version} not found`);

        const sunset = new Date(sunsetDate);
        const now = new Date();
        const monthsAway = (sunset - now) / (1000 * 60 * 60 * 24 * 30);

        if (monthsAway < 6) {
            throw new Error(`Sunset date must be at least 6 months in the future (${monthsAway.toFixed(1)} months requested)`);
        }

        if (!this.validateTransition(version, 'deprecated')) {
            throw new Error(`Cannot transition ${version} from ${v.status} to deprecated`);
        }

        v.status = 'deprecated';
        v.deprecationDate = new Date().toISOString();
        v.sunsetDate = sunset.toISOString();
    }

    /**
     * Mark version as sunset (only if already deprecated)
     * @param {string} version
     * @throws {Error} if version is not deprecated
     */
    sunset(version) {
        const v = this.get(version);
        if (!v) throw new Error(`Version ${version} not found`);

        if (!this.validateTransition(version, 'sunset')) {
            throw new Error(`Cannot transition ${version} from ${v.status} to sunset`);
        }

        v.status = 'sunset';
        v.sunsetDate = new Date().toISOString();
    }

    /**
     * Check if version is active (supported or beta)
     * @param {string} version
     * @returns {boolean}
     */
    isActive(version) {
        const status = this.getStatus(version);
        return status === 'supported' || status === 'beta';
    }

    /**
     * Check if version is deprecated
     * @param {string} version
     * @returns {boolean}
     */
    isDeprecated(version) {
        return this.getStatus(version) === 'deprecated';
    }

    /**
     * Check if version is sunset
     * @param {string} version
     * @returns {boolean}
     */
    isSunset(version) {
        return this.getStatus(version) === 'sunset';
    }

    /**
     * Check if version is in grace period after sunset
     * @param {string} version
     * @returns {boolean}
     */
    isInGracePeriod(version) {
        const v = this.get(version);
        if (!v || !v.sunsetDate) return false;

        const sunsetDate = new Date(v.sunsetDate);
        const now = new Date();
        const daysElapsed = (now - sunsetDate) / (1000 * 60 * 60 * 24);

        return this.isSunset(version) && daysElapsed <= ENFORCEMENT_CONFIG.sunsetGracePeriodDays;
    }

    /**
     * Get all active versions (supported + beta)
     * @returns {Array}
     */
    getActiveVersions() {
        return Object.keys(this.versions).filter(v => this.isActive(v));
    }

    /**
     * Get all deprecated versions
     * @returns {Array}
     */
    getDeprecatedVersions() {
        return Object.keys(this.versions).filter(v => this.isDeprecated(v));
    }

    /**
     * Get chronological version lifecycle events
     * @returns {Array}
     */
    getTimeline() {
        const events = [];

        Object.entries(this.versions).forEach(([version, config]) => {
            if (config.releaseDate) {
                events.push({
                    version,
                    event: 'released',
                    date: config.releaseDate,
                    status: config.status
                });
            }
            if (config.deprecationDate) {
                events.push({
                    version,
                    event: 'deprecated',
                    date: config.deprecationDate,
                    sunsetDate: config.sunsetDate
                });
            }
            if (config.sunsetDate && config.status === 'sunset') {
                events.push({
                    version,
                    event: 'sunset',
                    date: config.sunsetDate
                });
            }
        });

        return events.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /**
     * Validate version status transition
     * @param {string} version
     * @param {string} newStatus
     * @returns {boolean}
     */
    validateTransition(version, newStatus) {
        const current = this.getStatus(version);
        if (!current) return false;

        const allowedTransitions = VERSION_LIFECYCLE.transitions[current] || [];
        return allowedTransitions.includes(newStatus);
    }
}

// ─── DeprecationHeaderInjector Class ─────────────────────────────────────────

/**
 * Generates RFC 8594-compliant deprecation headers
 */
export class DeprecationHeaderInjector {
    /**
     * Get deprecation headers for a version
     * @param {string} version
     * @param {Object} versionConfig
     * @returns {Object}
     */
    static getHeaders(version, versionConfig) {
        const headers = {};

        if (!versionConfig) return headers;

        // Deprecation: @{deprecation_date} (RFC 8594)
        if (versionConfig.deprecationDate) {
            headers['Deprecation'] = this.formatHTTPDate(new Date(versionConfig.deprecationDate));
        }

        // Sunset: {sunset_date} (RFC 7231)
        if (versionConfig.sunsetDate) {
            headers['Sunset'] = this.formatHTTPDate(new Date(versionConfig.sunsetDate));
        }

        // Link: <migration_guide_url>; rel="deprecation" (RFC 8594)
        const migrationUrl = this.getMigrationGuideUrl(version, null);
        headers['Link'] = `<${migrationUrl}>; rel="deprecation"`;

        // Custom Finault headers
        headers['X-Finault-API-Version'] = version;
        headers['X-Finault-Deprecation-Warning'] =
            `This API version is deprecated. Please migrate by ${this.formatHTTPDate(new Date(versionConfig.sunsetDate))}.`;

        return headers;
    }

    /**
     * Format date as RFC 7231 HTTP-date
     * Example: "Thu, 01 Dec 2024 00:00:00 GMT"
     * @param {Date} date
     * @returns {string}
     */
    static formatHTTPDate(date) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const dayName = days[date.getUTCDay()];
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = months[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');

        return `${dayName}, ${day} ${month} ${year} ${hours}:${minutes}:${seconds} GMT`;
    }

    /**
     * Generate migration guide URL
     * @param {string} fromVersion
     * @param {string|null} toVersion
     * @returns {string}
     */
    static getMigrationGuideUrl(fromVersion, toVersion) {
        const baseUrl = ENFORCEMENT_CONFIG.migrationGuideBaseUrl;
        if (toVersion) {
            return `${baseUrl}/${fromVersion}-to-${toVersion}`;
        }
        return `${baseUrl}/${fromVersion}`;
    }
}

// ─── VersionUsageTracker Class ──────────────────────────────────────────────

/**
 * Tracks API version usage for migration planning
 */
export class VersionUsageTracker {
    constructor() {
        this.usage = {}; // { version: { endpoint: { method: count } } }
        this.orgUsage = {}; // { version: { orgId: count } }
        this.lastCallTime = {}; // { version: timestamp }
        this.dailyTrends = {}; // { version: { date: count } }
    }

    /**
     * Record an API call
     * @param {string} version
     * @param {string} endpoint
     * @param {string} method
     * @param {string} orgId
     */
    record(version, endpoint, method, orgId) {
        // Record endpoint usage
        if (!this.usage[version]) {
            this.usage[version] = {};
        }
        if (!this.usage[version][endpoint]) {
            this.usage[version][endpoint] = {};
        }
        if (!this.usage[version][endpoint][method]) {
            this.usage[version][endpoint][method] = 0;
        }
        this.usage[version][endpoint][method]++;

        // Record org usage
        if (!this.orgUsage[version]) {
            this.orgUsage[version] = {};
        }
        if (!this.orgUsage[version][orgId]) {
            this.orgUsage[version][orgId] = 0;
        }
        this.orgUsage[version][orgId]++;

        // Update last call time
        this.lastCallTime[version] = new Date();

        // Record daily trend
        const today = new Date().toISOString().split('T')[0];
        if (!this.dailyTrends[version]) {
            this.dailyTrends[version] = {};
        }
        if (!this.dailyTrends[version][today]) {
            this.dailyTrends[version][today] = 0;
        }
        this.dailyTrends[version][today]++;
    }

    /**
     * Get usage counts by version
     * @param {string|null} timeRange
     * @returns {Object}
     */
    getUsageByVersion(timeRange) {
        const result = {};

        Object.entries(this.usage).forEach(([version, endpoints]) => {
            result[version] = Object.values(endpoints).reduce((sum, methods) => {
                return sum + Object.values(methods).reduce((a, b) => a + b, 0);
            }, 0);
        });

        return result;
    }

    /**
     * Get endpoint-level breakdown for a version
     * @param {string} version
     * @param {string|null} timeRange
     * @returns {Object}
     */
    getUsageByEndpoint(version, timeRange) {
        if (!this.usage[version]) return {};

        const result = {};
        Object.entries(this.usage[version]).forEach(([endpoint, methods]) => {
            result[endpoint] = Object.values(methods).reduce((a, b) => a + b, 0);
        });

        return result;
    }

    /**
     * Get report of deprecated version usage by organization
     * @returns {Object}
     */
    getDeprecatedUsageReport() {
        const report = {};

        // Assuming versions marked as deprecated are tracked
        Object.entries(this.orgUsage).forEach(([version, orgs]) => {
            // This would be cross-referenced with VersionRegistry to find deprecated versions
            report[version] = {
                totalCalls: Object.values(orgs).reduce((a, b) => a + b, 0),
                orgBreakdown: orgs,
                lastCallTime: this.lastCallTime[version]
            };
        });

        return report;
    }

    /**
     * Get daily usage trend for a version
     * @param {string} version
     * @param {number} periodDays
     * @returns {Array}
     */
    getTrend(version, periodDays = 30) {
        if (!this.dailyTrends[version]) return [];

        const trends = [];
        const today = new Date();

        for (let i = 0; i < periodDays; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            trends.push({
                date: dateStr,
                count: this.dailyTrends[version][dateStr] || 0
            });
        }

        return trends.reverse();
    }

    /**
     * Get top consuming organizations for a version
     * @param {string} version
     * @param {number} limit
     * @returns {Array}
     */
    getTopConsumers(version, limit = 10) {
        if (!this.orgUsage[version]) return [];

        return Object.entries(this.orgUsage[version])
            .map(([orgId, count]) => ({ orgId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Estimate migration progress from one version to another
     * @param {string} fromVersion
     * @param {string} toVersion
     * @returns {number} Percentage (0-100)
     */
    estimateMigrationProgress(fromVersion, toVersion) {
        const fromUsage = this.getUsageByVersion()[fromVersion] || 0;
        const toUsage = this.getUsageByVersion()[toVersion] || 0;
        const totalUsage = fromUsage + toUsage;

        if (totalUsage === 0) return 0;
        return Math.round((toUsage / totalUsage) * 100);
    }

    /**
     * Export all metrics
     * @returns {Object}
     */
    exportMetrics() {
        return {
            usage: this.usage,
            orgUsage: this.orgUsage,
            lastCallTime: this.lastCallTime,
            dailyTrends: this.dailyTrends
        };
    }
}

// ─── SunsetScheduler Class ──────────────────────────────────────────────────

/**
 * Schedules sunset notifications at key intervals
 */
export class SunsetScheduler {
    constructor() {
        this.schedules = {}; // { version: { notifications: [] } }
    }

    /**
     * Schedule sunset with notifications at key intervals
     * @param {string} version
     * @param {Date|string} sunsetDate
     * @returns {Array} Notification schedule
     */
    schedule(version, sunsetDate) {
        const sunset = new Date(sunsetDate);
        const notifications = [];

        // Calculate notification times: 6mo, 3mo, 1mo, 1w, 1d before
        const intervals = [
            { days: 180, label: '6 months' },
            { days: 90, label: '3 months' },
            { days: 30, label: '1 month' },
            { days: 7, label: '1 week' },
            { days: 1, label: '1 day' }
        ];

        intervals.forEach(interval => {
            const notifyDate = new Date(sunset);
            notifyDate.setDate(notifyDate.getDate() - interval.days);

            notifications.push({
                version,
                label: `${interval.label} before sunset`,
                notificationDate: notifyDate.toISOString(),
                sunsetDate: sunset.toISOString(),
                daysBeforeSunset: interval.days
            });
        });

        this.schedules[version] = { notifications };
        return notifications;
    }

    /**
     * Get upcoming sunset notifications
     * @returns {Array}
     */
    getUpcomingSunsets() {
        const now = new Date();
        const upcomingNotifications = [];

        Object.entries(this.schedules).forEach(([version, schedule]) => {
            schedule.notifications.forEach(notif => {
                const notifDate = new Date(notif.notificationDate);
                if (notifDate > now && notifDate < new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
                    upcomingNotifications.push({
                        ...notif,
                        isUpcomingToday: true
                    });
                }
            });
        });

        return upcomingNotifications;
    }

    /**
     * Check which versions should be auto-sunset based on current date
     * @returns {Array}
     */
    checkSunsetStatus() {
        const now = new Date();
        const shouldSunset = [];

        Object.entries(this.schedules).forEach(([version, schedule]) => {
            schedule.notifications.forEach(notif => {
                const sunsetDate = new Date(notif.sunsetDate);
                if (sunsetDate <= now) {
                    shouldSunset.push({
                        version,
                        sunsetDate: notif.sunsetDate
                    });
                }
            });
        });

        return shouldSunset;
    }

    /**
     * Get notification schedule for a version
     * @param {string} version
     * @returns {Array|null}
     */
    getNotificationSchedule(version) {
        return this.schedules[version]?.notifications || null;
    }

    /**
     * Cancel sunset (move back to deprecated)
     * @param {string} version
     */
    cancelSunset(version) {
        delete this.schedules[version];
    }
}

// ─── Version Enforcement Middleware Factory ─────────────────────────────────

/**
 * Create Hono-compatible middleware for version enforcement
 * @param {VersionRegistry} registry
 * @param {Object} config
 * @returns {Function}
 */
export function createVersionEnforcementMiddleware(registry, config = {}) {
    const finalConfig = { ...ENFORCEMENT_CONFIG, ...config };
    const tracker = new VersionUsageTracker();

    return async (c, next) => {
        try {
            // Extract version from request
            const version = extractVersionFromRequest(c.req);

            // Check if version is specified
            if (!version && !finalConfig.allowUnversioned) {
                return c.json({
                    error: {
                        code: 'FINAULT-API-NO-VERSION',
                        message: 'API version is required. Specify via path (/api/v1/*), query (?version=v1), or Accept header.',
                        activeVersions: registry.getActiveVersions()
                    }
                }, 400);
            }

            const versionConfig = registry.get(version);

            // Check if version exists
            if (!versionConfig) {
                return c.json({
                    error: {
                        code: 'FINAULT-API-UNKNOWN-VERSION',
                        message: `Unknown API version: ${version}`,
                        activeVersions: registry.getActiveVersions()
                    }
                }, 400);
            }

            // Check if version is sunset
            if (registry.isSunset(version)) {
                const inGracePeriod = registry.isInGracePeriod(version);

                if (finalConfig.strictSunset && !inGracePeriod) {
                    // Hard reject
                    return c.json({
                        error: {
                            code: 'FINAULT-API-SUNSET',
                            message: `API version ${version} has been sunset`,
                            sunsetDate: versionConfig.sunsetDate,
                            migrationGuide: DeprecationHeaderInjector.getMigrationGuideUrl(version, null),
                            activeVersions: registry.getActiveVersions()
                        }
                    }, 410); // 410 Gone
                }

                if (inGracePeriod) {
                    // Allow but warn
                    const headers = {
                        'X-Finault-Grace-Period-Warning': `API version ${version} is in sunset grace period (${finalConfig.sunsetGracePeriodDays} days)`
                    };
                    Object.entries(headers).forEach(([key, val]) => {
                        c.header(key, val);
                    });
                }
            }

            // Handle deprecated versions
            if (registry.isDeprecated(version)) {
                if (finalConfig.deprecationWarningHeader) {
                    const headers = DeprecationHeaderInjector.getHeaders(version, versionConfig);
                    Object.entries(headers).forEach(([key, val]) => {
                        c.header(key, val);
                    });
                }

                if (finalConfig.logDeprecatedUsage) {
                    console.warn(`Deprecated API ${version} accessed at ${c.req.path}`);
                }
            }

            // Track metrics
            if (finalConfig.metricsEnabled) {
                const endpoint = c.req.path;
                const method = c.req.method;
                const orgId = c.req.header('X-Org-ID') || 'unknown';
                tracker.record(version, endpoint, method, orgId);
            }

            // Store version info in context
            c.set('apiVersion', version);
            c.set('versionConfig', versionConfig);
            c.set('versionRegistry', registry);
            c.set('usageTracker', tracker);

            await next();
        } catch (error) {
            console.error('Version enforcement middleware error:', error);
            return c.json({
                error: {
                    code: 'FINAULT-API-ERROR',
                    message: 'API version processing error'
                }
            }, 500);
        }
    };
}

// ─── Helper Function ────────────────────────────────────────────────────────

/**
 * Extract API version from request (path, query, or header)
 * @param {Object} req
 * @returns {string|null}
 */
function extractVersionFromRequest(req) {
    // Strategy 1: URL path versioning (/api/v1/*, /api/v2/*)
    const urlMatch = req.url.match(/\/api\/(v\d+)\//);
    if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
    }

    // Strategy 2: Query parameter (?version=v1)
    const url = new URL(req.url, 'http://localhost');
    const queryVersion = url.searchParams.get('version');
    if (queryVersion) {
        return queryVersion;
    }

    // Strategy 3: Accept header (Accept: application/vnd.finault+json;version=v1)
    const acceptHeader = req.header('Accept') || '';
    const acceptMatch = acceptHeader.match(/version\s*=\s*(v\d+)/i);
    if (acceptMatch && acceptMatch[1]) {
        return acceptMatch[1];
    }

    return null;
}

// ─── V2 Router Stub ─────────────────────────────────────────────────────────

/**
 * Create a minimal V2 API router with batch operations support
 * This is a stub implementation for demonstration
 * @returns {Object}
 */
export function createV2Router() {
    // This would be a real Hono Router in production
    // For testing purposes, we return an object with route handlers
    const routes = {};

    // Health check endpoint
    routes['/api/v2/health'] = {
        GET: (c) => {
            const responseData = {
                data: { version: 'v2', status: 'beta' },
                meta: { version: 'v2', requestId: 'req-' + Date.now(), pagination: null },
                links: { self: '/api/v2/health' }
            };
            // If c.json is available, use it; otherwise return raw object for testing
            if (c && typeof c.json === 'function') {
                return c.json(responseData);
            }
            return responseData;
        }
    };

    // Invoices endpoint with streaming support
    routes['/api/v2/invoices'] = {
        GET: (c) => {
            const acceptStream = c && c.req && c.req.header ? c.req.header('Accept')?.includes('stream=true') : false;
            const responseData = {
                data: [],
                meta: {
                    version: 'v2',
                    requestId: 'req-' + Date.now(),
                    pagination: { cursor: null, limit: 50, hasMore: false },
                    streamingEnabled: acceptStream
                },
                links: { self: '/api/v2/invoices', next: null, prev: null }
            };
            if (c && typeof c.json === 'function') {
                return c.json(responseData);
            }
            return responseData;
        }
    };

    // Batch operations endpoint
    routes['/api/v2/batch'] = {
        POST: (c) => {
            const responseData = {
                data: { operations: [], results: [] },
                meta: { version: 'v2', requestId: 'req-' + Date.now(), pagination: null },
                links: { self: '/api/v2/batch' }
            };
            if (c && typeof c.json === 'function') {
                return c.json(responseData);
            }
            return responseData;
        }
    };

    // OpenAPI schema endpoint
    routes['/api/v2/schema'] = {
        GET: (c) => {
            const responseData = {
                openapi: '3.0.0',
                info: { title: 'Finault API', version: 'v2' },
                paths: {
                    '/invoices': { get: {}, post: {} },
                    '/batch': { post: {} }
                },
                components: {
                    schemas: {
                        Invoice: { type: 'object', properties: {} }
                    }
                }
            };
            if (c && typeof c.json === 'function') {
                return c.json(responseData);
            }
            return responseData;
        }
    };

    return routes;
}

// ─── Factory Functions ──────────────────────────────────────────────────────

/**
 * Factory: Create a version registry
 * @param {Object} initialVersions
 * @returns {VersionRegistry}
 */
export function createVersionRegistry(initialVersions = {}) {
    return new VersionRegistry(initialVersions);
}

/**
 * Factory: Create a usage tracker
 * @returns {VersionUsageTracker}
 */
export function createVersionUsageTracker() {
    return new VersionUsageTracker();
}

/**
 * Factory: Create a sunset scheduler
 * @returns {SunsetScheduler}
 */
export function createSunsetScheduler() {
    return new SunsetScheduler();
}

// ─── Module Exports ────────────────────────────────────────────────────────

export default {
    // Config
    ENFORCEMENT_CONFIG,
    VERSION_LIFECYCLE,
    // Classes
    VersionRegistry,
    DeprecationHeaderInjector,
    VersionUsageTracker,
    SunsetScheduler,
    // Middleware
    createVersionEnforcementMiddleware,
    // Router
    createV2Router,
    // Factories
    createVersionRegistry,
    createVersionUsageTracker,
    createSunsetScheduler
};
