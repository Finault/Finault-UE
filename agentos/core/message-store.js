/**
 * MESSAGE STORE (W-025)
 * Consistent message history management
 *
 * PROBLEMS FIXED:
 * 1. finault-pal.js: property name mismatch between messageHistory and messages —
 *    the constructor initializes one name but methods access the other, so message
 *    history never accumulates across conversation turns.
 *
 * SOLUTION:
 * 1. MessageStore class with a single, consistent interface for message history
 * 2. Bounded storage with configurable max messages to prevent memory growth
 * 3. Convenience methods for common patterns (addUserMessage, addAssistantMessage, getContext)
 */

export const MESSAGE_STORE_CONFIG = {
    DEFAULT_MAX_MESSAGES: 100,
    DEFAULT_MAX_TOKENS_ESTIMATE: 4000
};

/**
 * MessageStore class
 * Provides a consistent, bounded message history interface
 */
export class MessageStore {
    /**
     * Initialize message store with configurable limits
     */
    constructor({ maxMessages = 100, maxTokensEstimate = 4000 } = {}) {
        this.messages = [];
        this.maxMessages = maxMessages;
        this.maxTokensEstimate = maxTokensEstimate;
        this.tokenCount = 0;
    }

    /**
     * Add a message and enforce limits
     */
    addMessage(role, content) {
        if (!role || typeof role !== 'string') {
            throw new Error('Role must be a non-empty string');
        }
        if (!content || typeof content !== 'string') {
            throw new Error('Content must be a non-empty string');
        }

        const message = { role, content };
        this.messages.push(message);

        // Estimate tokens (rough: ~4 chars per token)
        this.tokenCount += Math.ceil(content.length / 4);

        // Enforce message count limit
        while (this.messages.length > this.maxMessages) {
            const removed = this.messages.shift();
            this.tokenCount -= Math.ceil((removed.content || '').length / 4);
        }

        // Enforce token limit - remove oldest messages
        while (this.tokenCount > this.maxTokensEstimate && this.messages.length > 1) {
            const removed = this.messages.shift();
            this.tokenCount -= Math.ceil((removed.content || '').length / 4);
        }

        return this;
    }

    /**
     * Shorthand to add user message
     */
    addUserMessage(content) {
        return this.addMessage('user', content);
    }

    /**
     * Shorthand to add assistant message
     */
    addAssistantMessage(content) {
        return this.addMessage('assistant', content);
    }

    /**
     * Get all messages as array of { role, content }
     */
    getMessages() {
        return this.messages.map(m => ({
            role: m.role,
            content: m.content
        }));
    }

    /**
     * Get context window for API calls
     * Returns last N messages or less to stay within token limit
     */
    getContextWindow(maxMessages = null) {
        const limit = maxMessages !== null ? maxMessages : this.maxMessages;
        const messages = this.messages.slice(-limit);
        return messages.map(m => ({
            role: m.role,
            content: m.content
        }));
    }

    /**
     * Clear all messages
     */
    clear() {
        this.messages = [];
        this.tokenCount = 0;
        return this;
    }

    /**
     * Get number of messages stored
     */
    get length() {
        return this.messages.length;
    }

    /**
     * Get estimated token count
     */
    getTokenCount() {
        return this.tokenCount;
    }
}

export default {
    MESSAGE_STORE_CONFIG,
    MessageStore
};
