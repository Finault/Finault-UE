/**
 * FINAULT STRUCTURED LOGGER
 * Centralized structured logging for all infrastructure modules.
 *
 * Features:
 * - JSON-formatted log output (one line per entry)
 * - Service name prefix on every log
 * - Correlation ID propagation
 * - Log level filtering (DEBUG < INFO < WARN < ERROR < FATAL)
 * - Duration tracking helper
 * - Child logger creation (inherits parent context)
 */

export const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };

export class StructuredLogger {
    constructor({ service, minLevel = 'INFO', context = {} }) {
        this.service = service;
        this.minLevel = LOG_LEVELS[minLevel] ?? LOG_LEVELS.INFO;
        this.context = context; // base context attached to every log
    }

    // Core log method — checks level, formats JSON, outputs to console
    _log(level, message, data = {}) {
        if (LOG_LEVELS[level] < this.minLevel) return;
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            message,
            ...this.context,
            ...data
        };
        // Remove null/undefined values for cleaner output
        for (const key of Object.keys(entry)) {
            if (entry[key] === null || entry[key] === undefined) delete entry[key];
        }
        const output = JSON.stringify(entry);
        if (level === 'ERROR' || level === 'FATAL') {
            console.error(output);
        } else if (level === 'WARN') {
            console.warn(output);
        } else {
            console.log(output);
        }
        return entry; // for testing
    }

    debug(message, data) { return this._log('DEBUG', message, data); }
    info(message, data) { return this._log('INFO', message, data); }
    warn(message, data) { return this._log('WARN', message, data); }
    error(message, data) { return this._log('ERROR', message, data); }
    fatal(message, data) { return this._log('FATAL', message, data); }

    // Create child logger that inherits parent context
    child(additionalContext = {}) {
        return new StructuredLogger({
            service: this.service,
            minLevel: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.minLevel) || 'INFO',
            context: { ...this.context, ...additionalContext }
        });
    }

    // Timer helper — returns function that logs duration when called
    startTimer(operation) {
        const start = Date.now();
        return (data = {}) => {
            const duration_ms = Date.now() - start;
            return this.info(`${operation} completed`, { ...data, operation, duration_ms });
        };
    }
}

export function createLogger(service, options = {}) {
    return new StructuredLogger({ service, ...options });
}

export default { StructuredLogger, LOG_LEVELS, createLogger };
