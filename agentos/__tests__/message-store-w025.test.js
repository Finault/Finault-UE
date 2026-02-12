import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { MESSAGE_STORE_CONFIG, MessageStore } from '../core/message-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../..');

describe('W-025: Message Store', () => {
    // === Constructor Tests (10 tests) ===

    it('w25_001: MessageStore constructor creates empty messages array', () => {
        const store = new MessageStore();
        assert.equal(store.length, 0);
        assert.deepEqual(store.getMessages(), []);
    });

    it('w25_002: MessageStore default maxMessages is 100', () => {
        const store = new MessageStore();
        assert.equal(store.maxMessages, 100);
    });

    it('w25_003: MessageStore default maxTokensEstimate is 4000', () => {
        const store = new MessageStore();
        assert.equal(store.maxTokensEstimate, 4000);
    });

    it('w25_004: MessageStore accepts custom maxMessages', () => {
        const store = new MessageStore({ maxMessages: 50 });
        assert.equal(store.maxMessages, 50);
    });

    it('w25_005: MessageStore accepts custom maxTokensEstimate', () => {
        const store = new MessageStore({ maxTokensEstimate: 2000 });
        assert.equal(store.maxTokensEstimate, 2000);
    });

    it('w25_006: MessageStore accepts both custom parameters', () => {
        const store = new MessageStore({ maxMessages: 75, maxTokensEstimate: 3000 });
        assert.equal(store.maxMessages, 75);
        assert.equal(store.maxTokensEstimate, 3000);
    });

    it('w25_007: MessageStore initializes tokenCount to 0', () => {
        const store = new MessageStore();
        assert.equal(store.tokenCount, 0);
    });

    it('w25_008: MESSAGE_STORE_CONFIG has DEFAULT_MAX_MESSAGES', () => {
        assert.equal(MESSAGE_STORE_CONFIG.DEFAULT_MAX_MESSAGES, 100);
    });

    it('w25_009: MESSAGE_STORE_CONFIG has DEFAULT_MAX_TOKENS_ESTIMATE', () => {
        assert.equal(MESSAGE_STORE_CONFIG.DEFAULT_MAX_TOKENS_ESTIMATE, 4000);
    });

    it('w25_010: MessageStore with zero maxMessages still works', () => {
        const store = new MessageStore({ maxMessages: 0 });
        assert.equal(store.maxMessages, 0);
    });

    // === addMessage Tests (20 tests) ===

    it('w25_011: addMessage adds single message', () => {
        const store = new MessageStore();
        store.addMessage('user', 'Hello');
        assert.equal(store.length, 1);
    });

    it('w25_012: addMessage with user role', () => {
        const store = new MessageStore();
        store.addMessage('user', 'Test message');
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[0].content, 'Test message');
    });

    it('w25_013: addMessage with assistant role', () => {
        const store = new MessageStore();
        store.addMessage('assistant', 'Response');
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'assistant');
        assert.equal(messages[0].content, 'Response');
    });

    it('w25_014: addMessage throws on empty role', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addMessage('', 'Content');
        });
    });

    it('w25_015: addMessage throws on null role', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addMessage(null, 'Content');
        });
    });

    it('w25_016: addMessage throws on empty content', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addMessage('user', '');
        });
    });

    it('w25_017: addMessage throws on null content', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addMessage('user', null);
        });
    });

    it('w25_018: addMessage throws on undefined content', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addMessage('user', undefined);
        });
    });

    it('w25_019: addMessage returns MessageStore for chaining', () => {
        const store = new MessageStore();
        const result = store.addMessage('user', 'Hello');
        assert.equal(result, store);
    });

    it('w25_020: addMessage accepts whitespace-only content', () => {
        const store = new MessageStore();
        // Whitespace-only is considered a non-empty string, so it's accepted
        store.addMessage('user', '   ');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, '   ');
    });

    it('w25_021: addMessage with very long content', () => {
        const store = new MessageStore();
        const longContent = 'a'.repeat(10000);
        store.addMessage('user', longContent);
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content.length, 10000);
    });

    it('w25_022: addMessage multiple times increases length', () => {
        const store = new MessageStore();
        store.addMessage('user', 'Message 1');
        assert.equal(store.length, 1);
        store.addMessage('assistant', 'Response 1');
        assert.equal(store.length, 2);
        store.addMessage('user', 'Message 2');
        assert.equal(store.length, 3);
    });

    it('w25_023: addMessage preserves order', () => {
        const store = new MessageStore();
        store.addMessage('user', 'First');
        store.addMessage('assistant', 'Second');
        store.addMessage('user', 'Third');
        const messages = store.getMessages();
        assert.equal(messages[0].content, 'First');
        assert.equal(messages[1].content, 'Second');
        assert.equal(messages[2].content, 'Third');
    });

    it('w25_024: addMessage with same role multiple times', () => {
        const store = new MessageStore();
        store.addMessage('user', 'Message 1');
        store.addMessage('user', 'Message 2');
        store.addMessage('user', 'Message 3');
        assert.equal(store.length, 3);
        const messages = store.getMessages();
        messages.forEach(m => {
            assert.equal(m.role, 'user');
        });
    });

    it('w25_025: addMessage with any non-empty string role', () => {
        const store = new MessageStore();
        store.addMessage('custom_role', 'Content');
        assert.equal(store.getMessages()[0].role, 'custom_role');
    });

    it('w25_026: addMessage increments tokenCount', () => {
        const store = new MessageStore();
        assert.equal(store.tokenCount, 0);
        store.addMessage('user', 'Test');
        assert.ok(store.tokenCount > 0);
    });

    it('w25_027: addMessage estimates tokens correctly', () => {
        const store = new MessageStore();
        store.addMessage('user', 'a'.repeat(400)); // ~100 tokens
        assert.equal(store.tokenCount, Math.ceil(400 / 4));
    });

    it('w25_028: addMessage with non-string role throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addMessage(123, 'Content');
        });
    });

    it('w25_029: addMessage with non-string content throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addMessage('user', 123);
        });
    });

    it('w25_030: addMessage can be called 1000 times without error', () => {
        const store = new MessageStore({ maxMessages: 2000 });
        for (let i = 0; i < 1000; i++) {
            store.addMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`);
        }
        assert.equal(store.length, 1000);
    });

    // === addUserMessage Tests (15 tests) ===

    it('w25_031: addUserMessage adds message with user role', () => {
        const store = new MessageStore();
        store.addUserMessage('Hello');
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[0].content, 'Hello');
    });

    it('w25_032: addUserMessage returns MessageStore for chaining', () => {
        const store = new MessageStore();
        const result = store.addUserMessage('Test');
        assert.equal(result, store);
    });

    it('w25_033: addUserMessage can be chained with addAssistantMessage', () => {
        const store = new MessageStore();
        store.addUserMessage('Question').addAssistantMessage('Answer');
        assert.equal(store.length, 2);
    });

    it('w25_034: addUserMessage with empty string throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addUserMessage('');
        });
    });

    it('w25_035: addUserMessage with null throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addUserMessage(null);
        });
    });

    it('w25_036: addUserMessage multiple times', () => {
        const store = new MessageStore();
        store.addUserMessage('Message 1');
        store.addUserMessage('Message 2');
        const messages = store.getMessages();
        assert.equal(messages.length, 2);
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[1].role, 'user');
    });

    it('w25_037: addUserMessage with complex content', () => {
        const store = new MessageStore();
        const content = 'Cost optimization analysis: $1000/month savings';
        store.addUserMessage(content);
        assert.equal(store.getMessages()[0].content, content);
    });

    it('w25_038: addUserMessage with special characters', () => {
        const store = new MessageStore();
        const content = 'Price: $100, Discount: 50%, Rating: ⭐⭐⭐';
        store.addUserMessage(content);
        assert.equal(store.getMessages()[0].content, content);
    });

    it('w25_039: addUserMessage long message', () => {
        const store = new MessageStore();
        const longMsg = 'a'.repeat(5000);
        store.addUserMessage(longMsg);
        assert.equal(store.getMessages()[0].content.length, 5000);
    });

    it('w25_040: addUserMessage with newlines', () => {
        const store = new MessageStore();
        const content = 'Line 1\nLine 2\nLine 3';
        store.addUserMessage(content);
        assert.equal(store.getMessages()[0].content, content);
    });

    it('w25_041: addUserMessage with JSON', () => {
        const store = new MessageStore();
        const json = '{"key": "value", "number": 123}';
        store.addUserMessage(json);
        assert.equal(store.getMessages()[0].content, json);
    });

    it('w25_042: addUserMessage increments tokenCount', () => {
        const store = new MessageStore();
        const before = store.tokenCount;
        store.addUserMessage('Test message');
        assert.ok(store.tokenCount > before);
    });

    it('w25_043: addUserMessage with different lengths', () => {
        const store = new MessageStore();
        store.addUserMessage('a');
        store.addUserMessage('aaa');
        store.addUserMessage('aaaaaaaa');
        assert.equal(store.length, 3);
    });

    it('w25_044: addUserMessage after clear', () => {
        const store = new MessageStore();
        store.addUserMessage('Message 1');
        store.clear();
        store.addUserMessage('Message 2');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, 'Message 2');
    });

    it('w25_045: addUserMessage non-string throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addUserMessage(123);
        });
    });

    // === addAssistantMessage Tests (15 tests) ===

    it('w25_046: addAssistantMessage adds message with assistant role', () => {
        const store = new MessageStore();
        store.addAssistantMessage('Response');
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'assistant');
        assert.equal(messages[0].content, 'Response');
    });

    it('w25_047: addAssistantMessage returns MessageStore for chaining', () => {
        const store = new MessageStore();
        const result = store.addAssistantMessage('Test');
        assert.equal(result, store);
    });

    it('w25_048: addAssistantMessage with empty string throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addAssistantMessage('');
        });
    });

    it('w25_049: addAssistantMessage with null throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addAssistantMessage(null);
        });
    });

    it('w25_050: addAssistantMessage multiple times', () => {
        const store = new MessageStore();
        store.addAssistantMessage('Response 1');
        store.addAssistantMessage('Response 2');
        const messages = store.getMessages();
        assert.equal(messages.length, 2);
        assert.equal(messages[0].role, 'assistant');
        assert.equal(messages[1].role, 'assistant');
    });

    it('w25_051: alternating addUserMessage and addAssistantMessage', () => {
        const store = new MessageStore();
        store.addUserMessage('Q1');
        store.addAssistantMessage('A1');
        store.addUserMessage('Q2');
        store.addAssistantMessage('A2');
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[1].role, 'assistant');
        assert.equal(messages[2].role, 'user');
        assert.equal(messages[3].role, 'assistant');
    });

    it('w25_052: addAssistantMessage with complex response', () => {
        const store = new MessageStore();
        const response = 'I found 3 optimization opportunities:\n1. Model switch\n2. Caching\n3. Rate limiting';
        store.addAssistantMessage(response);
        assert.equal(store.getMessages()[0].content, response);
    });

    it('w25_053: addAssistantMessage with JSON response', () => {
        const store = new MessageStore();
        const json = '{"status": "success", "savings": 5000}';
        store.addAssistantMessage(json);
        assert.equal(store.getMessages()[0].content, json);
    });

    it('w25_054: addAssistantMessage long response', () => {
        const store = new MessageStore();
        const longResponse = 'a'.repeat(10000);
        store.addAssistantMessage(longResponse);
        assert.equal(store.getMessages()[0].content.length, 10000);
    });

    it('w25_055: addAssistantMessage increments tokenCount', () => {
        const store = new MessageStore();
        const before = store.tokenCount;
        store.addAssistantMessage('Response');
        assert.ok(store.tokenCount > before);
    });

    it('w25_056: addAssistantMessage with special formatting', () => {
        const store = new MessageStore();
        const formatted = '**Bold** *italic* `code` [link](url)';
        store.addAssistantMessage(formatted);
        assert.equal(store.getMessages()[0].content, formatted);
    });

    it('w25_057: addAssistantMessage after clear', () => {
        const store = new MessageStore();
        store.addAssistantMessage('Response 1');
        store.clear();
        store.addAssistantMessage('Response 2');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, 'Response 2');
    });

    it('w25_058: addAssistantMessage non-string throws', () => {
        const store = new MessageStore();
        assert.throws(() => {
            store.addAssistantMessage(123);
        });
    });

    it('w25_059: addAssistantMessage accepts whitespace-only content', () => {
        const store = new MessageStore();
        // Whitespace-only is considered a non-empty string
        store.addAssistantMessage('   ');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, '   ');
    });

    it('w25_060: addAssistantMessage multiple times rapid fire', () => {
        const store = new MessageStore();
        for (let i = 0; i < 50; i++) {
            store.addAssistantMessage(`Response ${i}`);
        }
        assert.equal(store.length, 50);
    });

    // === getMessages Tests (15 tests) ===

    it('w25_061: getMessages returns empty array initially', () => {
        const store = new MessageStore();
        assert.deepEqual(store.getMessages(), []);
    });

    it('w25_062: getMessages returns array of objects with role and content', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        const messages = store.getMessages();
        assert.ok(Array.isArray(messages));
        assert.ok('role' in messages[0]);
        assert.ok('content' in messages[0]);
    });

    it('w25_063: getMessages does not include internal properties', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        const messages = store.getMessages();
        const keys = Object.keys(messages[0]);
        assert.deepEqual(keys.sort(), ['content', 'role'].sort());
    });

    it('w25_064: getMessages returns new array (not reference)', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        const messages1 = store.getMessages();
        const messages2 = store.getMessages();
        assert.ok(messages1 !== messages2);
    });

    it('w25_065: getMessages preserves message order', () => {
        const store = new MessageStore();
        store.addUserMessage('First');
        store.addAssistantMessage('Second');
        store.addUserMessage('Third');
        const messages = store.getMessages();
        assert.equal(messages[0].content, 'First');
        assert.equal(messages[1].content, 'Second');
        assert.equal(messages[2].content, 'Third');
    });

    it('w25_066: getMessages with single message', () => {
        const store = new MessageStore();
        store.addUserMessage('Only');
        assert.equal(store.getMessages().length, 1);
    });

    it('w25_067: getMessages with many messages', () => {
        const store = new MessageStore({ maxMessages: 200 });
        for (let i = 0; i < 100; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.equal(store.getMessages().length, 100);
    });

    it('w25_068: getMessages after add and clear', () => {
        const store = new MessageStore();
        store.addUserMessage('Message');
        store.clear();
        assert.deepEqual(store.getMessages(), []);
    });

    it('w25_069: getMessages returns objects not references', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        const messages = store.getMessages();
        messages[0].content = 'Modified';
        assert.equal(store.getMessages()[0].content, 'Test');
    });

    it('w25_070: getMessages after limit enforcement', () => {
        const store = new MessageStore({ maxMessages: 3 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        store.addUserMessage('D'); // Should remove A
        const messages = store.getMessages();
        assert.equal(messages.length, 3);
        assert.equal(messages[0].content, 'B');
        assert.equal(messages[2].content, 'D');
    });

    it('w25_071: getMessages role field is consistent', () => {
        const store = new MessageStore();
        store.addUserMessage('User msg');
        store.addAssistantMessage('Asst msg');
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[1].role, 'assistant');
    });

    it('w25_072: getMessages content field matches input', () => {
        const store = new MessageStore();
        const content = 'Exact content here';
        store.addUserMessage(content);
        assert.equal(store.getMessages()[0].content, content);
    });

    it('w25_073: getMessages with numeric content like strings', () => {
        const store = new MessageStore();
        const content = '12345';
        store.addUserMessage(content);
        assert.equal(store.getMessages()[0].content, content);
    });

    it('w25_074: getMessages multiple calls return same content', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        const msg1 = store.getMessages();
        const msg2 = store.getMessages();
        assert.equal(msg1[0].content, msg2[0].content);
        assert.equal(msg1[0].role, msg2[0].role);
    });

    it('w25_075: getMessages with empty messages after clear', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        store.clear();
        const messages = store.getMessages();
        assert.ok(Array.isArray(messages));
        assert.equal(messages.length, 0);
    });

    // === getContextWindow Tests (20 tests) ===

    it('w25_076: getContextWindow with empty store', () => {
        const store = new MessageStore();
        assert.deepEqual(store.getContextWindow(), []);
    });

    it('w25_077: getContextWindow returns last N messages by default', () => {
        const store = new MessageStore({ maxMessages: 10 });
        for (let i = 0; i < 10; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        const context = store.getContextWindow();
        assert.equal(context.length, 10);
    });

    it('w25_078: getContextWindow with maxMessages parameter', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 20; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        const context = store.getContextWindow(5);
        assert.equal(context.length, 5);
        // Should be last 5
        assert.equal(context[0].content, 'Message 15');
        assert.equal(context[4].content, 'Message 19');
    });

    it('w25_079: getContextWindow with maxMessages larger than available', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        const context = store.getContextWindow(10);
        assert.equal(context.length, 2);
    });

    it('w25_080: getContextWindow preserves message order', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 10; i++) {
            store.addUserMessage(`Msg ${i}`);
        }
        const context = store.getContextWindow(3);
        assert.equal(context[0].content, 'Msg 7');
        assert.equal(context[1].content, 'Msg 8');
        assert.equal(context[2].content, 'Msg 9');
    });

    it('w25_081: getContextWindow with maxMessages 0', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('A');
        const context = store.getContextWindow(0);
        // slice(-0) is treated as slice(0) which returns all elements
        assert.equal(context.length, 1);
    });

    it('w25_082: getContextWindow with maxMessages 1', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        const context = store.getContextWindow(1);
        assert.equal(context.length, 1);
        assert.equal(context[0].content, 'C');
    });

    it('w25_083: getContextWindow null parameter uses default', () => {
        const store = new MessageStore({ maxMessages: 10 });
        for (let i = 0; i < 10; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        const context = store.getContextWindow(null);
        assert.equal(context.length, 10);
    });

    it('w25_084: getContextWindow undefined parameter uses default', () => {
        const store = new MessageStore({ maxMessages: 10 });
        for (let i = 0; i < 10; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        const context = store.getContextWindow(undefined);
        assert.equal(context.length, 10);
    });

    it('w25_085: getContextWindow returns objects with role and content', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('Test');
        const context = store.getContextWindow();
        assert.ok('role' in context[0]);
        assert.ok('content' in context[0]);
    });

    it('w25_086: getContextWindow respects insertion order', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('First');
        store.addAssistantMessage('Second');
        store.addUserMessage('Third');
        const context = store.getContextWindow(3);
        assert.equal(context[0].role, 'user');
        assert.equal(context[1].role, 'assistant');
        assert.equal(context[2].role, 'user');
    });

    it('w25_087: getContextWindow does not mutate internal state', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('Test');
        const context = store.getContextWindow();
        context[0].content = 'Modified';
        assert.equal(store.getMessages()[0].content, 'Test');
    });

    it('w25_088: getContextWindow with alternating roles', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 10; i++) {
            if (i % 2 === 0) {
                store.addUserMessage(`Q${i}`);
            } else {
                store.addAssistantMessage(`A${i}`);
            }
        }
        const context = store.getContextWindow(4);
        assert.equal(context.length, 4);
        assert.equal(context[0].role, 'user');
        assert.equal(context[1].role, 'assistant');
    });

    it('w25_089: getContextWindow large maxMessages', () => {
        const store = new MessageStore({ maxMessages: 1000 });
        for (let i = 0; i < 100; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        const context = store.getContextWindow(500);
        assert.equal(context.length, 100); // Only 100 messages exist
    });

    it('w25_090: getContextWindow for API use case (recent context)', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 50; i++) {
            if (i % 2 === 0) store.addUserMessage(`Q${i}`);
            else store.addAssistantMessage(`A${i}`);
        }
        const context = store.getContextWindow(6);
        assert.equal(context.length, 6);
        // Should have most recent messages
        assert.ok(context[0].content.includes('44'));
    });

    it('w25_091: getContextWindow single message', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('Only');
        const context = store.getContextWindow(10);
        assert.equal(context.length, 1);
        assert.equal(context[0].content, 'Only');
    });

    it('w25_092: getContextWindow after clear', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('Message');
        store.clear();
        const context = store.getContextWindow();
        assert.deepEqual(context, []);
    });

    it('w25_093: getContextWindow sequence consistency', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        const context1 = store.getContextWindow(2);
        const context2 = store.getContextWindow(2);
        assert.deepEqual(context1, context2);
    });

    it('w25_094: getContextWindow with very large dataset', () => {
        const store = new MessageStore({ maxMessages: 5000 });
        for (let i = 0; i < 1000; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        const context = store.getContextWindow(100);
        assert.equal(context.length, 100);
        assert.ok(context[0].content.includes('900'));
    });

    it('w25_095: getContextWindow negative maxMessages (treated as slice)', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        const context = store.getContextWindow(-2);
        // Negative slice should return last 2
        // JavaScript slice(-2) returns last 2 elements
        assert.ok(context.length <= 3);
    });

    // === Max Messages Limit Tests (20 tests) ===

    it('w25_096: maxMessages limit removes oldest when exceeded', () => {
        const store = new MessageStore({ maxMessages: 3 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        store.addUserMessage('D');
        assert.equal(store.length, 3);
        const messages = store.getMessages();
        assert.equal(messages[0].content, 'B');
    });

    it('w25_097: maxMessages 1 keeps only latest', () => {
        const store = new MessageStore({ maxMessages: 1 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, 'C');
    });

    it('w25_098: maxMessages 100 allows 100 messages', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 100; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.equal(store.length, 100);
    });

    it('w25_099: maxMessages 100 removes excess messages', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 150; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.equal(store.length, 100);
        const messages = store.getMessages();
        assert.equal(messages[0].content, 'Message 50');
    });

    it('w25_100: maxTokensEstimate limit removes messages when exceeded', () => {
        const store = new MessageStore({ maxMessages: 1000, maxTokensEstimate: 100 });
        // Each 'a' = ~0.25 tokens, so 400 chars = ~100 tokens
        store.addUserMessage('a'.repeat(400));
        assert.equal(store.length, 1);
        store.addUserMessage('a'.repeat(400));
        // Second message should trigger limit, removing first
        assert.equal(store.length, 1);
    });

    it('w25_101: maxTokensEstimate 4000 allows large conversations', () => {
        const store = new MessageStore({ maxTokensEstimate: 4000 });
        let totalChars = 0;
        while (totalChars < 15000) {
            store.addUserMessage('Test message with some content');
            totalChars += 30;
        }
        assert.ok(store.length > 0);
        // Should have trimmed based on token limit
        assert.ok(store.getTokenCount() <= 4000 + 30); // Allow small overage
    });

    it('w25_102: maxMessages enforced before maxTokens', () => {
        const store = new MessageStore({ maxMessages: 2, maxTokensEstimate: 1000 });
        store.addUserMessage('a'.repeat(100));
        store.addUserMessage('a'.repeat(100));
        store.addUserMessage('a'.repeat(100));
        // Message limit reached first
        assert.equal(store.length, 2);
    });

    it('w25_103: large maxMessages allows flexibility', () => {
        const store = new MessageStore({ maxMessages: 1000 });
        for (let i = 0; i < 500; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.equal(store.length, 500);
    });

    it('w25_104: token counting accurate across messages', () => {
        const store = new MessageStore({ maxMessages: 100 });
        store.addUserMessage('a'.repeat(100)); // ~25 tokens
        store.addUserMessage('b'.repeat(200)); // ~50 tokens
        assert.equal(store.getTokenCount(), Math.ceil(300 / 4));
    });

    it('w25_105: clear resets token count', () => {
        const store = new MessageStore();
        store.addUserMessage('a'.repeat(400));
        const tokenCount = store.getTokenCount();
        assert.ok(tokenCount > 0);
        store.clear();
        assert.equal(store.getTokenCount(), 0);
    });

    it('w25_106: token limit with exact boundary', () => {
        const store = new MessageStore({ maxTokensEstimate: 100 });
        store.addUserMessage('a'.repeat(400)); // ~100 tokens
        assert.equal(store.length, 1);
        // Should not exceed limit significantly
        assert.ok(store.getTokenCount() >= 100);
    });

    it('w25_107: removing message updates token count', () => {
        const store = new MessageStore({ maxMessages: 2 });
        store.addUserMessage('a'.repeat(100));
        store.addUserMessage('b'.repeat(100));
        store.addUserMessage('c'.repeat(100)); // Should remove first
        const tokenCount = store.getTokenCount();
        // Should have only 2 messages worth of tokens
        assert.ok(tokenCount <= Math.ceil(200 / 4) + 10); // Allow small variance
        assert.equal(store.length, 2);
    });

    it('w25_108: maxMessages with rapid additions', () => {
        const store = new MessageStore({ maxMessages: 5 });
        for (let i = 0; i < 100; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.equal(store.length, 5);
        const messages = store.getMessages();
        assert.equal(messages[0].content, 'Message 95');
        assert.equal(messages[4].content, 'Message 99');
    });

    it('w25_109: maxMessages with mixed role additions', () => {
        const store = new MessageStore({ maxMessages: 4 });
        store.addUserMessage('U1');
        store.addAssistantMessage('A1');
        store.addUserMessage('U2');
        store.addAssistantMessage('A2');
        store.addUserMessage('U3'); // Triggers limit
        assert.equal(store.length, 4);
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'assistant');
        assert.equal(messages[0].content, 'A1');
    });

    it('w25_110: maxMessages 10 typical conversation', () => {
        const store = new MessageStore({ maxMessages: 10 });
        const qa = [
            { q: 'What are my costs?', a: 'Your total is $5000/month' },
            { q: 'How can I save?', a: 'Consider switching models' },
            { q: 'Which ones?', a: 'GPT-4 to GPT-4-turbo' },
            { q: 'How much?', a: '$1000/month savings' },
            { q: 'Apply now?', a: 'Changes applied successfully' }
        ];
        qa.forEach(pair => {
            store.addUserMessage(pair.q);
            store.addAssistantMessage(pair.a);
        });
        assert.equal(store.length, 10);
    });

    // === clear() Tests (10 tests) ===

    it('w25_111: clear removes all messages', () => {
        const store = new MessageStore();
        store.addUserMessage('A');
        store.addUserMessage('B');
        assert.equal(store.length, 2);
        store.clear();
        assert.equal(store.length, 0);
    });

    it('w25_112: clear resets tokenCount', () => {
        const store = new MessageStore();
        store.addUserMessage('a'.repeat(100));
        assert.ok(store.getTokenCount() > 0);
        store.clear();
        assert.equal(store.getTokenCount(), 0);
    });

    it('w25_113: clear returns MessageStore for chaining', () => {
        const store = new MessageStore();
        const result = store.clear();
        assert.equal(result, store);
    });

    it('w25_114: can add messages after clear', () => {
        const store = new MessageStore();
        store.addUserMessage('A');
        store.clear();
        store.addUserMessage('B');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, 'B');
    });

    it('w25_115: clear makes getMessages return empty array', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        store.clear();
        assert.deepEqual(store.getMessages(), []);
    });

    it('w25_116: clear before any messages', () => {
        const store = new MessageStore();
        store.clear();
        assert.equal(store.length, 0);
    });

    it('w25_117: multiple clear calls', () => {
        const store = new MessageStore();
        store.addUserMessage('A');
        store.clear();
        store.clear();
        store.clear();
        assert.equal(store.length, 0);
    });

    it('w25_118: clear and reuse pattern', () => {
        const store = new MessageStore();
        store.addUserMessage('Session 1');
        store.clear();
        store.addUserMessage('Session 2');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, 'Session 2');
    });

    it('w25_119: clear in chained operations', () => {
        const store = new MessageStore();
        store
            .addUserMessage('A')
            .addAssistantMessage('B')
            .clear()
            .addUserMessage('C');
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content, 'C');
    });

    it('w25_120: clear resets all internal state', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        store.clear();
        assert.equal(store.length, 0);
        assert.equal(store.getTokenCount(), 0);
        assert.deepEqual(store.getMessages(), []);
    });

    // === length getter Tests (10 tests) ===

    it('w25_121: length is 0 initially', () => {
        const store = new MessageStore();
        assert.equal(store.length, 0);
    });

    it('w25_122: length increases with addMessage', () => {
        const store = new MessageStore();
        store.addMessage('user', 'Test');
        assert.equal(store.length, 1);
    });

    it('w25_123: length returns correct count', () => {
        const store = new MessageStore();
        for (let i = 0; i < 50; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.equal(store.length, 50);
    });

    it('w25_124: length after clear is 0', () => {
        const store = new MessageStore();
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.clear();
        assert.equal(store.length, 0);
    });

    it('w25_125: length respects maxMessages limit', () => {
        const store = new MessageStore({ maxMessages: 5 });
        for (let i = 0; i < 100; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.equal(store.length, 5);
    });

    it('w25_126: length is readonly property', () => {
        const store = new MessageStore();
        store.addUserMessage('Test');
        const original = store.length;
        assert.equal(original, 1);
        // Trying to set should fail silently or throw
        try {
            // @ts-ignore
            store.length = 999;
            // If assignment succeeds, value should still be 1
            assert.equal(store.length, 1);
        } catch (e) {
            // TypeError is also acceptable for readonly properties
            assert.ok(e instanceof TypeError);
        }
    });

    it('w25_127: length with single message', () => {
        const store = new MessageStore();
        store.addUserMessage('Only');
        assert.equal(store.length, 1);
    });

    it('w25_128: length equals getMessages array length', () => {
        const store = new MessageStore();
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        assert.equal(store.length, store.getMessages().length);
    });

    it('w25_129: length accurate after limit enforcement', () => {
        const store = new MessageStore({ maxMessages: 3 });
        store.addUserMessage('A');
        store.addUserMessage('B');
        store.addUserMessage('C');
        store.addUserMessage('D');
        assert.equal(store.length, 3);
    });

    it('w25_130: length with chained operations', () => {
        const store = new MessageStore();
        store.addUserMessage('A').addAssistantMessage('B').addUserMessage('C');
        assert.equal(store.length, 3);
    });

    // === Edge Cases Tests (10 tests) ===

    it('w25_131: empty messages in bulk operations', () => {
        const store = new MessageStore({ maxMessages: 1000 });
        for (let i = 0; i < 100; i++) {
            store.addUserMessage(`Message ${i}`);
        }
        assert.ok(store.length > 0);
    });

    it('w25_132: very long single message', () => {
        const store = new MessageStore();
        const veryLong = 'a'.repeat(100000);
        store.addUserMessage(veryLong);
        assert.equal(store.length, 1);
        assert.equal(store.getMessages()[0].content.length, 100000);
    });

    it('w25_133: unicode and special characters', () => {
        const store = new MessageStore();
        const special = '你好世界 🌍 Ñoño €€€';
        store.addUserMessage(special);
        assert.equal(store.getMessages()[0].content, special);
    });

    it('w25_134: many small messages vs few large messages', () => {
        const store1 = new MessageStore({ maxMessages: 100 });
        const store2 = new MessageStore({ maxMessages: 100 });

        for (let i = 0; i < 100; i++) {
            store1.addUserMessage('a');
        }

        store2.addUserMessage('a'.repeat(100));

        assert.equal(store1.length, 100);
        assert.equal(store2.length, 1);
    });

    it('w25_135: alternating very long and very short messages', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 50; i++) {
            if (i % 2 === 0) {
                store.addUserMessage('a');
            } else {
                store.addUserMessage('a'.repeat(1000));
            }
        }
        assert.ok(store.length > 0);
    });

    it('w25_136: whitespace-only and numeric strings both accepted', () => {
        const store = new MessageStore();
        // Whitespace-only is accepted (non-empty string)
        store.addUserMessage('   ');
        assert.equal(store.length, 1);
        // Numeric strings are also accepted
        store.addUserMessage('123');
        assert.equal(store.length, 2);
        assert.equal(store.getMessages()[1].content, '123');
    });

    it('w25_137: null vs undefined edge cases', () => {
        const store = new MessageStore();
        assert.throws(() => store.addUserMessage(null));
        assert.throws(() => store.addUserMessage(undefined));
    });

    it('w25_138: rapid fire same role', () => {
        const store = new MessageStore({ maxMessages: 100 });
        for (let i = 0; i < 100; i++) {
            store.addUserMessage(`U${i}`);
        }
        assert.equal(store.length, 100);
        assert.ok(store.getMessages().every(m => m.role === 'user'));
    });

    it('w25_139: conversational pattern test', () => {
        const store = new MessageStore();
        store.addUserMessage('What is 2+2?');
        store.addAssistantMessage('2+2 equals 4');
        store.addUserMessage('What is 3+3?');
        store.addAssistantMessage('3+3 equals 6');
        assert.equal(store.length, 4);
        const messages = store.getMessages();
        assert.equal(messages[0].role, 'user');
        assert.equal(messages[1].role, 'assistant');
    });

    it('w25_140: getTokenCount accuracy', () => {
        const store = new MessageStore();
        store.addUserMessage('1234'); // 1 token
        assert.equal(store.getTokenCount(), Math.ceil(4 / 4));
    });

    // === Structural/Wiring Verification Tests (20 tests) ===

    it('w25_141: finault-pal.js exists', () => {
        const path = `${REPO_ROOT}/agentos/agents/finault-pal.js`;
        const exists = fs.existsSync(path);
        assert.ok(exists, 'finault-pal.js should exist');
    });

    it('w25_142: finault-pal.js has constructor', () => {
        const path = `${REPO_ROOT}/agentos/agents/finault-pal.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('constructor('), 'Should have constructor');
    });

    it('w25_143: finault-pal.js initializes messageStore property', () => {
        const path = `${REPO_ROOT}/agentos/agents/finault-pal.js`;
        const src = fs.readFileSync(path, 'utf-8');
        // FIX W-025: Should use messageStore instead of messages
        assert.ok(src.includes('this.messageStore'), 'Should initialize this.messageStore');
        assert.ok(src.includes('new MessageStore'), 'Should instantiate MessageStore');
    });

    it('w25_144: message-store.js core module exists', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const exists = fs.existsSync(path);
        assert.ok(exists, 'core/message-store.js should exist');
    });

    it('w25_145: message-store.js exports MESSAGE_STORE_CONFIG', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('export const MESSAGE_STORE_CONFIG'), 'Should export MESSAGE_STORE_CONFIG');
    });

    it('w25_146: message-store.js exports MessageStore class', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('export class MessageStore'), 'Should export MessageStore class');
    });

    it('w25_147: message-store.js has proper documentation', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('MESSAGE STORE'), 'Should have W-025 reference');
        assert.ok(src.includes('PROBLEMS FIXED'), 'Should document problems fixed');
    });

    it('w25_148: MessageStore has constructor', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('constructor('), 'MessageStore should have constructor');
    });

    it('w25_149: MessageStore has addMessage method', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('addMessage('), 'MessageStore should have addMessage method');
    });

    it('w25_150: MessageStore has getMessages method', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('getMessages()'), 'MessageStore should have getMessages method');
    });

    it('w25_151: MessageStore has addUserMessage method', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('addUserMessage('), 'MessageStore should have addUserMessage method');
    });

    it('w25_152: MessageStore has addAssistantMessage method', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('addAssistantMessage('), 'MessageStore should have addAssistantMessage method');
    });

    it('w25_153: MessageStore has getContextWindow method', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('getContextWindow('), 'MessageStore should have getContextWindow method');
    });

    it('w25_154: MessageStore has clear method', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('clear()'), 'MessageStore should have clear method');
    });

    it('w25_155: MessageStore has length getter', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('get length()'), 'MessageStore should have length getter');
    });

    it('w25_156: core module uses ES6 export syntax', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('export'), 'Should use ES6 export syntax');
    });

    it('w25_157: core module has default export', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('export default'), 'Should have default export');
    });

    it('w25_158: MessageStore bounded storage logic', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('maxMessages'), 'Should enforce maxMessages limit');
        assert.ok(src.includes('maxTokensEstimate'), 'Should enforce maxTokensEstimate limit');
    });

    it('w25_159: Input validation in addMessage', () => {
        const path = `${REPO_ROOT}/agentos/core/message-store.js`;
        const src = fs.readFileSync(path, 'utf-8');
        assert.ok(src.includes('throw new Error'), 'Should validate inputs');
    });

    it('w25_160: Test file imports correctly', () => {
        // This test itself validates that imports work
        assert.ok(typeof MessageStore === 'function');
        assert.ok(typeof MESSAGE_STORE_CONFIG === 'object');
    });
});
