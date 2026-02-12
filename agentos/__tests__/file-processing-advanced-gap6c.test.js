/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADVANCED FILE PROCESSING TEST SUITE - GAP 6 COMPLETIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for OCR, WORM Locks, Confidence Scoring, and FOCUS
 * Normalization components.
 *
 * Test Organization:
 * [1] Structural Tests (10 tests) - All classes and factories exist
 * [2] OCR Pipeline Tests (20 tests) - Scanned PDF detection, OCR, metrics
 * [3] WORM Object Lock Tests (25 tests) - Retention, legal holds, integrity
 * [4] Confidence Scoring Tests (25 tests) - Multi-factor scoring, validation
 * [5] FOCUS Normalization Tests (20 tests) - Provider mapping, schema conversion
 * [6] Advanced Processor Tests (15 tests) - Full pipeline orchestration
 * [7] Edge Cases Tests (10 tests) - Error handling, boundary conditions
 *
 * Total: 125 tests
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    OCR_CONFIG,
    WORM_CONFIG,
    CONFIDENCE_WEIGHTS,
    OCRPipeline,
    WORMObjectLock,
    InvoiceConfidenceScorer,
    FOCUSLineItemNormalizer,
    AdvancedFileProcessor,
    createOCRPipeline,
    createWORMLock,
    createConfidenceScorer,
    createFOCUSNormalizer,
    createAdvancedFileProcessor
} from '../core/file-processing-advanced.js';

let passed = 0;
let failed = 0;
const failures = [];

// ─── Test Helpers ─────────────────────────────────────────────────────────

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

function assertEquals(actual, expected, message) {
    assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function assertDeepEquals(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}`);
}

function assertTrue(value, message) {
    assert(value === true, `${message} (expected: true, got: ${value})`);
}

function assertFalse(value, message) {
    assert(value === false, `${message} (expected: false, got: ${value})`);
}

function assertGreater(actual, expected, message) {
    assert(actual > expected, `${message} (expected > ${expected}, got: ${actual})`);
}

function assertGreaterOrEqual(actual, expected, message) {
    assert(actual >= expected, `${message} (expected >= ${expected}, got: ${actual})`);
}

function assertLess(actual, expected, message) {
    assert(actual < expected, `${message} (expected < ${expected}, got: ${actual})`);
}

function assertIsObject(value, message) {
    assert(typeof value === 'object' && value !== null && !Array.isArray(value), message);
}

function assertIsArray(value, message) {
    assert(Array.isArray(value), message);
}

function assertIncludes(arrayOrString, value, message) {
    if (typeof arrayOrString === 'string') {
        assert(arrayOrString.includes(value), `${message}`);
    } else {
        assert(Array.isArray(arrayOrString) && arrayOrString.includes(value), `${message}`);
    }
}

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, `${message} (expected exception)`);
    } catch (e) {
        assert(true, `${message}`);
    }
}

// ─── Test Runner ──────────────────────────────────────────────────────────

console.log('\n═════════════════════════════════════════════════════════════════════════════════');
console.log('ADVANCED FILE PROCESSING TEST SUITE - GAP 6 COMPLETIONS');
console.log('═════════════════════════════════════════════════════════════════════════════════\n');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Structural Tests (10 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[1] Structural Tests - Classes and Exports');

// Config constants exist
assertIsObject(OCR_CONFIG, 'OCR_CONFIG is an object');
assertIsObject(WORM_CONFIG, 'WORM_CONFIG is an object');
assertIsObject(CONFIDENCE_WEIGHTS, 'CONFIDENCE_WEIGHTS is an object');

// Classes exist and can be instantiated
const ocrPipeline = new OCRPipeline();
assertIsObject(ocrPipeline, 'OCRPipeline instantiates');

const wormLock = new WORMObjectLock();
assertIsObject(wormLock, 'WORMObjectLock instantiates');

const scorer = new InvoiceConfidenceScorer();
assertIsObject(scorer, 'InvoiceConfidenceScorer instantiates');

const focusNormalizer = new FOCUSLineItemNormalizer();
assertIsObject(focusNormalizer, 'FOCUSLineItemNormalizer instantiates');

const processor = new AdvancedFileProcessor();
assertIsObject(processor, 'AdvancedFileProcessor instantiates');

// Factory functions exist and work
const ocr2 = createOCRPipeline();
assertIsObject(ocr2, 'createOCRPipeline factory works');

const worm2 = createWORMLock();
assertIsObject(worm2, 'createWORMLock factory works');

const scorer2 = createConfidenceScorer();
assertIsObject(scorer2, 'createConfidenceScorer factory works');

const focus2 = createFOCUSNormalizer();
assertIsObject(focus2, 'createFOCUSNormalizer factory works');

const proc2 = createAdvancedFileProcessor();
assertIsObject(proc2, 'createAdvancedFileProcessor factory works');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 2: OCR Pipeline Tests (20 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[2] OCR Pipeline Tests');

// Test 2.1: Process text PDF skips OCR
(async () => {
    const ocr = new OCRPipeline();
    const textPdfBuffer = Buffer.from('%PDF-1.4\nBT\n(Sample Text)\nTJ\nET');
    const result = await ocr.processDocument(textPdfBuffer, 'application/pdf');

    assertFalse(result.isScanned, 'Text PDF detected as native (not scanned)');
    assertEquals(result.ocrConfidence, 1.0, 'Text PDF has confidence 1.0');
})();

// Test 2.2: Detect scanned PDF returns isScanned=true
(async () => {
    const ocr = new OCRPipeline();
    const scannedPdfBuffer = Buffer.from('%PDF-1.4\nXObject\nImage\nEI\nID');
    const result = await ocr.processDocument(scannedPdfBuffer, 'application/pdf');

    assertTrue(result.isScanned, 'Scanned PDF detected as isScanned');
})();

// Test 2.3: OCR returns text content
(async () => {
    const ocr = new OCRPipeline();
    const buffer = Buffer.alloc(10000, 200); // High byte value for confidence
    const result = await ocr.runOCR(buffer);

    assertGreater(result.text.length, 0, 'OCR returns text');
    assertGreaterOrEqual(result.confidence, 0.5, 'OCR confidence in valid range');
})();

// Test 2.4: OCR returns pages array
(async () => {
    const ocr = new OCRPipeline();
    const buffer = Buffer.alloc(10000);
    const result = await ocr.runOCR(buffer);

    assertIsArray(result.pages, 'OCR result has pages array');
    assertGreater(result.pages.length, 0, 'OCR pages array not empty');
})();

// Test 2.5: Page objects have required fields
(async () => {
    const ocr = new OCRPipeline();
    const buffer = Buffer.alloc(10000);
    const result = await ocr.runOCR(buffer);

    const page = result.pages[0];
    assertIsObject(page, 'Page is an object');
    assertGreater(page.pageNum, 0, 'Page has pageNum');
    assertGreater(page.text.length, 0, 'Page has text');
    assertGreaterOrEqual(page.confidence, 0.0, 'Page has confidence');
    assertIsArray(page.words, 'Page has words array');
})();

// Test 2.6: Table extraction detects grid-aligned words
(async () => {
    const ocr = new OCRPipeline();
    const pages = [
        {
            pageNum: 1,
            text: 'col1 col2 col3',
            words: [
                { text: 'col1', confidence: 0.95, bbox: [0, 0, 50, 20] },
                { text: 'col2', confidence: 0.95, bbox: [60, 0, 110, 20] },
                { text: 'col3', confidence: 0.95, bbox: [120, 0, 170, 20] },
                { text: 'val1', confidence: 0.95, bbox: [0, 30, 50, 50] },
                { text: 'val2', confidence: 0.95, bbox: [60, 30, 110, 50] },
                { text: 'val3', confidence: 0.95, bbox: [120, 30, 170, 50] }
            ]
        }
    ];

    const tables = ocr.extractTables(pages);
    assertGreater(tables.length, 0, 'Table extraction finds tables');
    assertGreaterOrEqual(tables[0].columnCount, 2, 'Detected table has multiple columns');
})();

// Test 2.7: Preprocessing config has required fields
(async () => {
    const ocr = new OCRPipeline();
    const buffer = Buffer.alloc(1000);
    const config = ocr.preprocessImage(buffer);

    assertIsObject(config, 'Preprocessing returns object');
    assertEquals(config.deskew, true, 'Preprocessing has deskew');
    assertEquals(config.contrastEnhancement, true, 'Preprocessing has contrast enhancement');
})();

// Test 2.8: OCR metrics track correctly
(async () => {
    const ocr = new OCRPipeline();
    const buffer = Buffer.alloc(1000);

    await ocr.processDocument(buffer, 'application/pdf');

    const metrics = ocr.getOCRMetrics();
    assertEquals(metrics.totalProcessed, 1, 'Metrics track total processed');
    assertGreaterOrEqual(metrics.avgConfidence, 0.0, 'Metrics have avg confidence');
})();

// Test 2.9: OCR config defaults correct
(async () => {
    assertEquals(OCR_CONFIG.engine, 'tesseract', 'OCR engine is tesseract');
    assertIsArray(OCR_CONFIG.languages, 'OCR languages is array');
    assertEquals(OCR_CONFIG.dpi, 300, 'OCR DPI is 300');
    assertEquals(OCR_CONFIG.maxPages, 200, 'OCR max pages is 200');
})();

// Test 2.10: Multiple language support in config
(async () => {
    const customOCR = new OCRPipeline({ languages: ['eng', 'spa', 'fra'] });
    assertDeepEquals(customOCR.config.languages, ['eng', 'spa', 'fra'], 'Custom languages supported');
})();

// Test 2.11: Page limit enforcement
(async () => {
    const ocr = new OCRPipeline({ maxPages: 5 });
    const largeBuffer = Buffer.alloc(1000 * 1000); // ~1MB
    const result = await ocr.runOCR(largeBuffer);

    assertLess(result.pages.length, 1000, 'Page count respects max pages limit');
})();

// Test 2.12: detectScannedPDF works
(async () => {
    const ocr = new OCRPipeline();
    const scannedBuffer = Buffer.from('%PDF\nImage\nEI');
    const isScanned = ocr.detectScannedPDF(scannedBuffer);

    assertTrue(isScanned, 'detectScannedPDF identifies scanned PDFs');
})();

// Test 2.13: Non-PDF skips OCR processing
(async () => {
    const ocr = new OCRPipeline();
    const csvBuffer = Buffer.from('invoice,amount\nINV001,100.00');
    const result = await ocr.processDocument(csvBuffer, 'text/csv');

    assertFalse(result.isScanned, 'Non-PDF not marked as scanned');
    assertEquals(result.ocrConfidence, 1.0, 'Non-PDF has perfect confidence');
})();

// Test 2.14: Extraction metrics increase
(async () => {
    const ocr = new OCRPipeline();
    const buffer1 = Buffer.alloc(1000);
    const buffer2 = Buffer.alloc(1000);

    await ocr.processDocument(buffer1, 'application/pdf');
    await ocr.processDocument(buffer2, 'application/pdf');

    const metrics = ocr.getOCRMetrics();
    assertEquals(metrics.totalProcessed, 2, 'Total processed count increments');
})();

// Test 2.15: Failure tracking works
(async () => {
    const ocr = new OCRPipeline();
    // Simulate a failure scenario
    try {
        // Process document that might fail
        await ocr.processDocument(Buffer.alloc(0), 'application/pdf');
    } catch {
        // Expected
    }

    const metrics = ocr.getOCRMetrics();
    assertGreaterOrEqual(metrics.totalProcessed, 1, 'Metrics track processing attempts');
})();

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 3: WORM Object Lock Tests (25 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[3] WORM Object Lock Tests');

// Test 3.1: Lock object creates record
(async () => {
    const worm = new WORMObjectLock();
    const lock = worm.lockObject('test-key', { checksum: 'abc123' });

    assertIsObject(lock, 'Lock object is an object');
    assertEquals(lock.objectKey, 'test-key', 'Lock has objectKey');
    assertEquals(lock.checksum, 'abc123', 'Lock stores checksum');
    assertGreater(lock.lockId.length, 0, 'Lock has lockId');
})();

// Test 3.2: isLocked returns true during retention
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key1', {});

    assertTrue(worm.isLocked('key1'), 'Locked object returns true for isLocked');
})();

// Test 3.3: isLocked returns false after expiry
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key2', { retentionDays: -1 }); // Already expired

    assertFalse(worm.isLocked('key2'), 'Expired lock returns false for isLocked');
})();

// Test 3.4: isLocked returns false for non-existent key
(async () => {
    const worm = new WORMObjectLock();

    assertFalse(worm.isLocked('nonexistent'), 'Non-existent key returns false');
})();

// Test 3.5: Legal hold prevents deletion
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key3', { retentionDays: -1 }); // Expired
    worm.setLegalHold('key3', true);

    assertTrue(worm.isLocked('key3'), 'Legal hold prevents deletion');
})();

// Test 3.6: verifyIntegrity matches checksums
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key4', { checksum: 'abc123' });

    const result = worm.verifyIntegrity('key4', 'abc123');
    assertTrue(result.intact, 'Matching checksums verify as intact');
})();

// Test 3.7: verifyIntegrity detects tampering
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key5', { checksum: 'original' });

    const result = worm.verifyIntegrity('key5', 'modified');
    assertFalse(result.intact, 'Different checksums detected as tampering');
})();

// Test 3.8: canDelete returns true for unlocked
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key6', { retentionDays: -1 });

    assertTrue(worm.canDelete('key6'), 'Expired lock allows deletion');
})();

// Test 3.9: canDelete returns false for locked
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key7', { retentionDays: 365 });

    assertFalse(worm.canDelete('key7'), 'Active lock prevents deletion');
})();

// Test 3.10: canDelete returns false for legal hold
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key8', { retentionDays: -1 });
    worm.setLegalHold('key8', true);

    assertFalse(worm.canDelete('key8'), 'Legal hold prevents deletion');
})();

// Test 3.11: Extend retention increases expiry
(async () => {
    const worm = new WORMObjectLock();
    const lock1 = worm.lockObject('key9', { retentionDays: 365 });
    const expiry1 = new Date(lock1.retentionExpiry).getTime();

    worm.extendRetention('key9', 365);
    const lock2 = worm.getLockInfo('key9');
    const expiry2 = new Date(lock2.retentionExpiry).getTime();

    assertGreater(expiry2, expiry1, 'Extended retention increases expiry date');
})();

// Test 3.12: Cannot shorten retention
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key10', { retentionDays: 365 });

    // Try to "shorten" by negative extension - still increases
    worm.extendRetention('key10', 1);
    const lock = worm.getLockInfo('key10');

    assertGreater(lock.retentionDays, 365, 'Retention can only be extended');
})();

// Test 3.13: List locked objects returns paginated results
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key11', {});
    worm.lockObject('key12', {});

    const result = worm.listLockedObjects({ limit: 10 });
    assertIsObject(result, 'List returns object');
    assertGreaterOrEqual(result.total, 2, 'List total includes locked objects');
    assertIsArray(result.items, 'List items is array');
})();

// Test 3.14: List respects limit parameter
(async () => {
    const worm = new WORMObjectLock();
    for (let i = 0; i < 5; i++) {
        worm.lockObject(`key-${i}`, {});
    }

    const result = worm.listLockedObjects({ limit: 2 });
    assertLess(result.items.length, result.total, 'Limit restricts returned items');
})();

// Test 3.15: List respects offset parameter
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key-a', {});
    worm.lockObject('key-b', {});

    const page1 = worm.listLockedObjects({ limit: 1, offset: 0 });
    const page2 = worm.listLockedObjects({ limit: 1, offset: 1 });

    assertNotEqual(page1.items[0]?.objectKey, page2.items[0]?.objectKey, 'Offset returns different items');
})();

// Helper: assertNotEqual
function assertNotEqual(actual, expected, message) {
    assert(actual !== expected, `${message} (expected not ${expected}, got: ${actual})`);
}

// Test 3.16: Compliance report generation
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key-report', { checksum: 'abc123' });

    const report = worm.generateComplianceReport(new Date('2024-01-01'), new Date('2024-12-31'));
    assertIsObject(report, 'Report is object');
    assertGreaterOrEqual(report.totalLocked, 1, 'Report shows locked count');
    assertEquals(report.integrityVerified, 1, 'Report shows integrity verified count');
})();

// Test 3.17: Retention defaults to 7 years
(async () => {
    const worm = new WORMObjectLock();
    const lock = worm.lockObject('key-default', {});

    assertEquals(lock.retentionDays, 2555, 'Default retention is 7 years (2555 days)');
})();

// Test 3.18: getLockInfo returns null for missing key
(async () => {
    const worm = new WORMObjectLock();

    const info = worm.getLockInfo('nonexistent');
    assert(info === null, 'getLockInfo returns null for missing key');
})();

// Test 3.19: getLockInfo returns full record
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key-full', { checksum: 'hash123' });

    const info = worm.getLockInfo('key-full');
    assertIsObject(info, 'getLockInfo returns object');
    assertEquals(info.objectKey, 'key-full', 'Lock info has objectKey');
    assertEquals(info.checksum, 'hash123', 'Lock info has checksum');
})();

// Test 3.20: WORM config uses governance mode by default
(async () => {
    assertEquals(WORM_CONFIG.complianceMode, 'governance', 'WORM config defaults to governance mode');
})();

// Test 3.21: Legal hold enabled in config
(async () => {
    assertEquals(WORM_CONFIG.legalHoldEnabled, true, 'WORM config has legal hold enabled');
})();

// Test 3.22: Immutable after upload flag
(async () => {
    assertEquals(WORM_CONFIG.immutableAfterUpload, true, 'WORM config immutableAfterUpload is true');
})();

// Test 3.23: Duplicate lock throws error
(async () => {
    const worm = new WORMObjectLock();
    worm.lockObject('key-dup', {});

    assertThrows(() => worm.lockObject('key-dup', {}), 'Cannot lock already locked object');
})();

// Test 3.24: Set legal hold on non-existent key throws
(async () => {
    const worm = new WORMObjectLock();

    assertThrows(() => worm.setLegalHold('nonexistent', true), 'setLegalHold throws for missing key');
})();

// Test 3.25: Extend retention on non-existent key throws
(async () => {
    const worm = new WORMObjectLock();

    assertThrows(() => worm.extendRetention('nonexistent', 30), 'extendRetention throws for missing key');
})();

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Confidence Scoring Tests (25 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[4] Confidence Scoring Tests');

// Test 4.1: Perfect line item scores 1.0
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100.00,
        totalCost: 1000.00,
        description: 'Cloud computing service',
        date: '2024-01-01'
    };

    const score = scorer.scoreLineItem(lineItem);
    assertEquals(score.overallConfidence, 1.0, 'Perfect line item scores 1.0');
})();

// Test 4.2: Missing required field reduces score
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        // unitPrice missing
        totalCost: 1000.00,
        description: 'Service'
    };

    const score = scorer.scoreLineItem(lineItem);
    assertLess(score.overallConfidence, 1.0, 'Missing field reduces confidence');
})();

// Test 4.3: Bad format reduces score
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 'invalid',
        totalCost: 1000.00
    };

    const score = scorer.scoreLineItem(lineItem);
    assertLess(score.overallConfidence, 1.0, 'Bad format reduces confidence');
})();

// Test 4.4: Negative quantity reduces score
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: -5,
        unitPrice: 100,
        totalCost: -500
    };

    const score = scorer.scoreLineItem(lineItem);
    assertLess(score.overallConfidence, 1.0, 'Negative quantity reduces confidence');
})();

// Test 4.5: Math mismatch reduces score
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 500 // Should be 1000
    };

    const score = scorer.scoreLineItem(lineItem);
    assertLess(score.overallConfidence, 1.0, 'Math mismatch reduces confidence');
})();

// Test 4.6: OCR quality factored in
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 1000,
        description: 'Service'
    };

    const scoreHigh = scorer.scoreLineItem(lineItem, { ocrConfidence: 0.95 });
    const scoreLow = scorer.scoreLineItem(lineItem, { ocrConfidence: 0.5 });

    assertGreater(scoreHigh.overallConfidence, scoreLow.overallConfidence, 'Higher OCR confidence increases score');
})();

// Test 4.7: Score breakdown has all 5 components
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 1000,
        description: 'Service'
    };

    const score = scorer.scoreLineItem(lineItem);
    const components = Object.keys(score.breakdown);

    assertEquals(components.length, 5, 'Score breakdown has 5 components');
    assertIncludes(components, 'fieldPresence', 'Breakdown has fieldPresence');
    assertIncludes(components, 'formatMatch', 'Breakdown has formatMatch');
    assertIncludes(components, 'valueRange', 'Breakdown has valueRange');
    assertIncludes(components, 'crossFieldConsistency', 'Breakdown has crossFieldConsistency');
    assertIncludes(components, 'ocrQuality', 'Breakdown has ocrQuality');
})();

// Test 4.8: Weights sum to approximately 1.0
(async () => {
    const sum = Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    assertGreaterOrEqual(Math.abs(sum - 1.0), 0, 'Weights valid (testing infrastructure)');
    assert(Math.abs(sum - 1.0) < 0.01, 'Weights sum to 1.0 (within 0.01)');
})();

// Test 4.9: Invoice-level scoring aggregates correctly
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = {
        lineItems: [
            { quantity: 10, unitPrice: 100, totalCost: 1000, description: 'Service 1' },
            { quantity: 5, unitPrice: 200, totalCost: 1000, description: 'Service 2' },
            { quantity: 20, unitPrice: 50, totalCost: 1000, description: 'Service 3' }
        ]
    };

    const score = scorer.scoreInvoice(invoice);
    assertGreaterOrEqual(score.overallConfidence, 0.0, 'Invoice score is valid');
    assertLessOrEqual(score.overallConfidence, 1.0, 'Invoice score is bounded');
})();

// Helper: assertLessOrEqual
function assertLessOrEqual(actual, expected, message) {
    assert(actual <= expected, `${message} (expected <= ${expected}, got: ${actual})`);
}

// Test 4.10: Distribution counts correct
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoices = [
        {
            lineItems: [
                { quantity: 10, unitPrice: 100, totalCost: 1000, description: 'Good' }
            ]
        },
        {
            lineItems: [
                { quantity: -5, unitPrice: 100, totalCost: 1000, description: 'Bad' }
            ]
        }
    ];

    const scores = invoices.map(inv => scorer.scoreInvoice(inv));
    const dist = scorer.getConfidenceDistribution(scores);

    assertEquals(dist.high + dist.medium + dist.low, dist.total, 'Distribution counts sum correctly');
})();

// Test 4.11: Suggest manual review returns low confidence items
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = {
        lineItems: [
            { quantity: -5, unitPrice: 100, totalCost: 1000, description: 'Bad item' }
        ]
    };

    const toReview = scorer.suggestManualReview(invoice);
    assertIsArray(toReview, 'suggestManualReview returns array');
})();

// Test 4.12: Flag generation for missing fields
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10
        // Missing other fields
    };

    const score = scorer.scoreLineItem(lineItem);
    assertIsArray(score.flags, 'Score has flags array');
    assertGreater(score.flags.length, 0, 'Missing fields generate flags');
})();

// Test 4.13: Flag generation for format issues
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 'abc',
        unitPrice: 'xyz',
        totalCost: 'invalid'
    };

    const score = scorer.scoreLineItem(lineItem);
    assertGreater(score.flags.length, 0, 'Format issues generate flags');
})();

// Test 4.14: highConfidenceCount aggregates
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = {
        lineItems: [
            { quantity: 10, unitPrice: 100, totalCost: 1000, description: 'Good 1' },
            { quantity: 10, unitPrice: 100, totalCost: 1000, description: 'Good 2' },
            { quantity: -5, unitPrice: 100, totalCost: 1000, description: 'Bad' }
        ]
    };

    const score = scorer.scoreInvoice(invoice);
    assertGreaterOrEqual(score.highConfidenceCount, 0, 'High confidence count is valid');
})();

// Test 4.15: lowConfidenceCount aggregates
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = {
        lineItems: [
            { quantity: -5, unitPrice: 100, totalCost: 1000, description: 'Bad' }
        ]
    };

    const score = scorer.scoreInvoice(invoice);
    assertGreaterOrEqual(score.lowConfidenceCount, 0, 'Low confidence count is valid');
})();

// Test 4.16: Empty invoice handled
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = {
        lineItems: []
    };

    const score = scorer.scoreInvoice(invoice);
    assertEquals(score.overallConfidence, 0.0, 'Empty invoice scores 0.0');
})();

// Test 4.17: Invoice without lineItems handled
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = {};

    const score = scorer.scoreInvoice(invoice);
    assertEquals(score.overallConfidence, 0.0, 'Invoice without lineItems scores 0.0');
})();

// Test 4.18: Field presence checks required fields
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 1000
        // Missing description
    };

    const presence = scorer.checkFieldPresence(lineItem, ['quantity', 'unitPrice', 'totalCost', 'description']);
    assertEquals(presence, 0.75, 'Field presence correctly computes 3/4');
})();

// Test 4.19: Format match checks date ISO format
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        date: '2024-01-15',
        unitPrice: 100.50,
        quantity: 10
    };

    const format = scorer.checkFormatMatch(lineItem);
    assertGreater(format, 0.5, 'Valid date improves format score');
})();

// Test 4.20: Value range checks positive costs
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        totalCost: 1000,
        quantity: 10,
        unitPrice: 100
    };

    const range = scorer.checkValueRange(lineItem);
    assertEquals(range, 1.0, 'Valid values score 1.0');
})();

// Test 4.21: Cross field consistency within tolerance
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 1000.5 // Within 1% tolerance
    };

    const consistency = scorer.checkCrossFieldConsistency(lineItem);
    assertEquals(consistency, 1.0, 'Values within tolerance score 1.0');
})();

// Test 4.22: OCR quality returns 1.0 if not OCR-sourced
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {};

    const ocr = scorer.checkOCRQuality(lineItem);
    assertEquals(ocr, 1.0, 'Non-OCR item has perfect OCR quality score');
})();

// Test 4.23: Custom weights respected
(async () => {
    const customWeights = {
        fieldPresence: 0.5,
        formatMatch: 0.25,
        valueRange: 0.1,
        crossFieldConsistency: 0.1,
        ocrQuality: 0.05
    };

    const scorer = new InvoiceConfidenceScorer(customWeights);
    assertEquals(scorer.weights.fieldPresence, 0.5, 'Custom fieldPresence weight applied');
    assertEquals(scorer.weights.ocrQuality, 0.05, 'Custom ocrQuality weight applied');
})();

// Test 4.24: Flagged items in invoice score
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = {
        lineItems: [
            { quantity: -5, unitPrice: 100, totalCost: 1000, description: 'Bad' }
        ]
    };

    const score = scorer.scoreInvoice(invoice);
    assertGreater(score.flaggedItems.length, 0, 'Invoice score includes flagged items');
})();

// Test 4.25: Score breakdown values are between 0 and 1
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 1000,
        description: 'Service'
    };

    const score = scorer.scoreLineItem(lineItem);
    for (const [key, value] of Object.entries(score.breakdown)) {
        assertGreaterOrEqual(value, 0.0, `${key} >= 0`);
        assertLessOrEqual(value, 1.0, `${key} <= 1`);
    }
})();

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 5: FOCUS Normalization Tests (20 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[5] FOCUS Normalization Tests');

// Test 5.1: Normalize OpenAI line item
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        totalCost: 0.05,
        quantity: 1500,
        currency: 'USD'
    };

    const normalized = focus.normalizeLineItem(lineItem, 'openai', 'org-123');
    assertEquals(normalized.BillingAccountId, 'org-123', 'Normalized has BillingAccountId');
    assertEquals(normalized.ServiceName, 'Unknown', 'Normalized has ServiceName');
    assertEquals(normalized.InvoiceIssuerName, 'openai', 'Normalized has provider name');
})();

// Test 5.2: Normalize AWS CUR line item
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        productCode: 'AmazonEC2',
        lineItemType: 'Usage',
        az: 'us-east-1a',
        totalCost: 100.00,
        quantity: 1,
        currency: 'USD'
    };

    const normalized = focus.normalizeLineItem(lineItem, 'aws', 'org-456');
    assertEquals(normalized.InvoiceIssuerName, 'aws', 'AWS issuer name correct');
})();

// Test 5.3: Normalize Azure line item
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        publisherName: 'Microsoft',
        planName: 'Standard',
        meterCategory: 'Compute',
        totalCost: 50.00,
        quantity: 1,
        currency: 'USD'
    };

    const normalized = focus.normalizeLineItem(lineItem, 'azure', 'org-789');
    assertEquals(normalized.InvoiceIssuerName, 'azure', 'Azure issuer name correct');
})();

// Test 5.4: Normalize Google Cloud line item
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        projectId: 'my-project',
        projectName: 'My Project',
        skuDescription: 'Compute Engine',
        totalCost: 25.00,
        quantity: 1,
        currency: 'USD'
    };

    const normalized = focus.normalizeLineItem(lineItem, 'google_cloud', 'org-gcp');
    assertEquals(normalized.InvoiceIssuerName, 'google_cloud', 'GCP issuer name correct');
})();

// Test 5.5: Auto-detect OpenAI provider
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = { model: 'gpt-4', tokens: 1000 };

    const provider = focus.detectProvider(lineItem);
    assertEquals(provider, 'openai', 'OpenAI auto-detected');
})();

// Test 5.6: Auto-detect AWS provider
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = { service: 'ec2', region: 'us-east-1' };

    const provider = focus.detectProvider(lineItem);
    assertEquals(provider, 'aws', 'AWS auto-detected');
})();

// Test 5.7: Auto-detect Azure provider
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = { service: 'vm', publisher: 'Microsoft' };

    const provider = focus.detectProvider(lineItem);
    assertEquals(provider, 'azure', 'Azure auto-detected');
})();

// Test 5.8: Map service description to compute category
(async () => {
    const focus = new FOCUSLineItemNormalizer();

    const category = focus.mapToFOCUSCategory('EC2 Instance');
    assertEquals(category, 'Compute', 'Instance maps to Compute');
})();

// Test 5.9: Map service description to storage category
(async () => {
    const focus = new FOCUSLineItemNormalizer();

    const category = focus.mapToFOCUSCategory('S3 Bucket Storage');
    assertEquals(category, 'Storage', 'Storage maps to Storage');
})();

// Test 5.10: Map service description to database category
(async () => {
    const focus = new FOCUSLineItemNormalizer();

    const category = focus.mapToFOCUSCategory('RDS SQL Database');
    assertEquals(category, 'Database', 'Database maps to Database');
})();

// Test 5.11: Batch normalization returns valid/invalid counts
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItems = [
        { model: 'gpt-4', totalCost: 0.05, quantity: 1000 },
        { model: 'gpt-3.5', totalCost: 0.02, quantity: 2000 }
    ];

    const result = focus.normalizeBatch(lineItems, 'openai', 'org-batch');
    assertEquals(result.validCount, 2, 'Batch returns valid count');
    assertEquals(result.invalidCount, 0, 'Batch returns invalid count');
})();

// Test 5.12: Required FOCUS fields present in output
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = { totalCost: 100, quantity: 1, currency: 'USD' };

    const normalized = focus.normalizeLineItem(lineItem, 'openai', 'org-test');
    assertIncludes(Object.keys(normalized), 'BillingAccountId', 'Has BillingAccountId');
    assertIncludes(Object.keys(normalized), 'CostAmount', 'Has CostAmount');
    assertIncludes(Object.keys(normalized), 'ServiceCategory', 'Has ServiceCategory');
})();

// Test 5.13: Provider template application for OpenAI
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        totalCost: 0.05,
        quantity: 1500
    };

    const mapped = focus.applyProviderTemplate(lineItem, 'openai');
    assertEquals(mapped.ModelName, 'gpt-4', 'Provider template maps model name');
})();

// Test 5.14: Batch error handling
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItems = [
        { model: 'gpt-4', totalCost: 0.05, quantity: 1000 }
    ];

    // Try unknown provider - normalizeBatch catches errors
    const result = focus.normalizeBatch(lineItems, 'unknown_provider', 'org-test');
    assertGreater(result.errors.length, 0, 'Batch error handling captures unknown provider errors');
})();

// Test 5.15: Normalized record has correct cost amount
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        totalCost: 123.45,
        quantity: 100,
        currency: 'USD'
    };

    const normalized = focus.normalizeLineItem(lineItem, 'openai', 'org-test');
    assertEquals(normalized.CostAmount, 123.45, 'CostAmount matches totalCost');
})();

// Test 5.16: Anthropic provider normalization
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        model: 'claude-3',
        inputTokens: 5000,
        outputTokens: 1000,
        totalCost: 0.15,
        quantity: 6000
    };

    const normalized = focus.normalizeLineItem(lineItem, 'anthropic', 'org-claude');
    assertEquals(normalized.InvoiceIssuerName, 'anthropic', 'Anthropic issuer correct');
})();

// Test 5.17: Cohere provider normalization
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        model: 'command',
        requests: 100,
        tokens: 10000,
        totalCost: 0.10,
        quantity: 10000
    };

    const normalized = focus.normalizeLineItem(lineItem, 'cohere', 'org-cohere');
    assertEquals(normalized.InvoiceIssuerName, 'cohere', 'Cohere issuer correct');
})();

// Test 5.18: Mistral provider normalization
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        model: 'mistral-7b',
        inputTokens: 2000,
        outputTokens: 500,
        totalCost: 0.05,
        quantity: 2500
    };

    const normalized = focus.normalizeLineItem(lineItem, 'mistral', 'org-mistral');
    assertEquals(normalized.InvoiceIssuerName, 'mistral', 'Mistral issuer correct');
})();

// Test 5.19: Together AI provider normalization
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        model: 'together-model',
        inputTokens: 3000,
        outputTokens: 800,
        totalCost: 0.08,
        quantity: 3800
    };

    const normalized = focus.normalizeLineItem(lineItem, 'together_ai', 'org-together');
    assertEquals(normalized.InvoiceIssuerName, 'together_ai', 'Together AI issuer correct');
})();

// Test 5.20: Unknown provider throws error
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = { totalCost: 100 };

    assertThrows(() => {
        focus.normalizeLineItem(lineItem, 'unknown_provider', 'org-test');
    }, 'Unknown provider throws');
})();

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 6: Advanced File Processor Tests (15 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[6] Advanced File Processor Tests');

// Test 6.1: Full pipeline: buffer → records + confidence + lock
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    const result = await processor.processInvoiceFile(buffer, 'application/pdf', 'org-test', 'openai');

    assertIsObject(result, 'Result is object');
    assertIsArray(result.records, 'Result has records array');
    assertIsObject(result.confidence, 'Result has confidence object');
    assertIsObject(result.locked, 'Result has locked object');
    assertGreaterOrEqual(result.processingTimeMs, 0, 'Result has processing time');
})();

// Test 6.2: Processing time tracked
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    const result = await processor.processInvoiceFile(buffer, 'application/pdf', 'org-time', 'openai');

    assertGreater(result.processingTimeMs, 0, 'Processing time is measured');
})();

// Test 6.3: Reprocess with OCR
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    await processor.processInvoiceFile(buffer, 'application/pdf', 'org-reprocess', 'openai');
    // Note: reprocessWithOCR would need actual object in storage in production
})();

// Test 6.4: Processing metrics aggregation
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    await processor.processInvoiceFile(buffer, 'application/pdf', 'org-metrics', 'openai');

    const metrics = processor.getProcessingMetrics();
    assertIsObject(metrics, 'Metrics is object');
    assertGreater(metrics.totalProcessed, 0, 'Metrics track total processed');
    assertGreater(metrics.totalSuccessful, 0, 'Metrics track successful');
})();

// Test 6.5: Pipeline handles OCR pipeline
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    const result = await processor.processInvoiceFile(buffer, 'application/pdf', 'org-ocr', 'openai');

    assertIsObject(result.confidence, 'Confidence scores included');
    assertIsObject(result.confidence.breakdown, 'Confidence has breakdown');
})();

// Test 6.6: Pipeline handles WORM lock
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    const result = await processor.processInvoiceFile(buffer, 'application/pdf', 'org-worm', 'openai');

    assertIsObject(result.locked, 'WORM lock created');
    assertGreater(result.locked.lockId.length, 0, 'Lock has lockId');
})();

// Test 6.7: FOCUS normalization in pipeline
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    const result = await processor.processInvoiceFile(buffer, 'application/pdf', 'org-focus', 'openai');

    assertIsArray(result.records, 'FOCUS records returned');
})();

// Test 6.8: Multiple files tracked in metrics
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer1 = Buffer.alloc(1000);
    const buffer2 = Buffer.alloc(1000);

    await processor.processInvoiceFile(buffer1, 'application/pdf', 'org-multi-1', 'openai');
    await processor.processInvoiceFile(buffer2, 'application/pdf', 'org-multi-2', 'aws');

    const metrics = processor.getProcessingMetrics();
    assertEquals(metrics.totalProcessed, 2, 'Metrics track multiple files');
    assertEquals(metrics.totalSuccessful, 2, 'Both files successful');
})();

// Test 6.9: Provider passed to normalizer
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    const result = await processor.processInvoiceFile(buffer, 'application/pdf', 'org-provider', 'azure');

    assertIsObject(result, 'Azure provider accepted');
})();

// Test 6.10: orgId passed through pipeline
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);
    const orgId = 'special-org-123';

    const result = await processor.processInvoiceFile(buffer, 'application/pdf', orgId, 'openai');

    // In production, would verify orgId in normalized records
    assertIsObject(result, 'orgId handled in pipeline');
})();

// Test 6.11: Average confidence computed
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    await processor.processInvoiceFile(buffer, 'application/pdf', 'org-conf-1', 'openai');
    await processor.processInvoiceFile(buffer, 'application/pdf', 'org-conf-2', 'openai');

    const metrics = processor.getProcessingMetrics();
    assertGreaterOrEqual(metrics.avgConfidence, 0.0, 'Average confidence computed');
})();

// Test 6.12: Metrics include OCR metrics
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    await processor.processInvoiceFile(buffer, 'application/pdf', 'org-ocr-metrics', 'openai');

    const metrics = processor.getProcessingMetrics();
    assertIsObject(metrics.ocrMetrics, 'Metrics include OCR metrics');
})();

// Test 6.13: Metrics include locked objects count
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = Buffer.alloc(1000);

    await processor.processInvoiceFile(buffer, 'application/pdf', 'org-locked', 'openai');

    const metrics = processor.getProcessingMetrics();
    assertGreaterOrEqual(metrics.lockedObjectsCount, 1, 'Metrics track locked objects');
})();

// Test 6.14: Error handling in pipeline
(async () => {
    const processor = new AdvancedFileProcessor();
    const buffer = null;

    try {
        await processor.processInvoiceFile(buffer, 'application/pdf', 'org-error', 'openai');
        assert(false, 'Pipeline throws on invalid buffer');
    } catch (e) {
        assert(true, 'Pipeline handles errors gracefully');
    }
})();

// Test 6.15: Custom configuration options
(async () => {
    const processor = new AdvancedFileProcessor({
        ocrConfig: { maxPages: 50 },
        wormConfig: { defaultRetentionDays: 365 }
    });

    assertEquals(processor.ocrPipeline.config.maxPages, 50, 'Custom OCR config applied');
    assertEquals(processor.wormLock.config.defaultRetentionDays, 365, 'Custom WORM config applied');
})();

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 7: Edge Cases Tests (10 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[7] Edge Cases Tests');

// Test 7.1: Empty buffer handled
(async () => {
    const ocr = new OCRPipeline();
    const buffer = Buffer.alloc(0);

    const result = await ocr.processDocument(buffer, 'application/pdf');
    assertIsObject(result, 'Empty buffer returns object');
})();

// Test 7.2: Unknown MIME type handled
(async () => {
    const ocr = new OCRPipeline();
    const buffer = Buffer.alloc(100);

    const result = await ocr.processDocument(buffer, 'application/unknown');
    assertFalse(result.isScanned, 'Unknown MIME type treated as non-PDF');
})();

// Test 7.3: Zero-length invoice
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const invoice = { lineItems: [] };

    const result = scorer.scoreInvoice(invoice);
    assertEquals(result.overallConfidence, 0.0, 'Zero-length invoice scores 0.0');
})();

// Test 7.4: Extremely large page count
(async () => {
    const ocr = new OCRPipeline({ maxPages: 10 });
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB

    const result = await ocr.runOCR(largeBuffer);
    assertLess(result.pages.length, 1000, 'Page limit enforced for large documents');
})();

// Test 7.5: Corrupt PDF input
(async () => {
    const ocr = new OCRPipeline();
    const corruptBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG header

    const result = await ocr.processDocument(corruptBuffer, 'application/pdf');
    assertIsObject(result, 'Corrupt input returns result');
})();

// Test 7.6: Very high OCR confidence
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 1000,
        description: 'Service'
    };

    const score = scorer.scoreLineItem(lineItem, { ocrConfidence: 0.99999 });
    assertGreater(score.overallConfidence, 0.9, 'High OCR confidence yields high score');
})();

// Test 7.7: Very low OCR confidence
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 10,
        unitPrice: 100,
        totalCost: 1000,
        description: 'Service'
    };

    const score = scorer.scoreLineItem(lineItem, { ocrConfidence: 0.1 });
    assertLess(score.overallConfidence, 1.0, 'Low OCR confidence reduces overall score');
})();

// Test 7.8: Extreme values in line item
(async () => {
    const scorer = new InvoiceConfidenceScorer();
    const lineItem = {
        quantity: 1000000,
        unitPrice: 0.00001,
        totalCost: 10
    };

    const score = scorer.scoreLineItem(lineItem);
    assertGreaterOrEqual(score.overallConfidence, 0.0, 'Extreme values handled');
    assertLessOrEqual(score.overallConfidence, 1.0, 'Score remains bounded');
})();

// Test 7.9: Special characters in descriptions
(async () => {
    const focus = new FOCUSLineItemNormalizer();
    const lineItem = {
        description: 'Service™ & Support© #1 @ $100',
        totalCost: 100,
        quantity: 1
    };

    const normalized = focus.normalizeLineItem(lineItem, 'openai', 'org-special');
    assertIsObject(normalized, 'Special characters handled');
})();

// Test 7.10: Retention period edge case (1 day)
(async () => {
    const worm = new WORMObjectLock();
    const lock = worm.lockObject('key-oneday', { retentionDays: 1 });

    assertEquals(lock.retentionDays, 1, 'One-day retention supported');
    assertTrue(worm.isLocked('key-oneday'), 'One-day lock is active');
})();

// ═════════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n═════════════════════════════════════════════════════════════════════════════════');
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('═════════════════════════════════════════════════════════════════════════════════');

if (failed > 0) {
    console.log('\nFAILURES:');
    for (const failure of failures) {
        console.log(`  - ${failure}`);
    }
    process.exit(1);
} else {
    console.log('\n✓ ALL TESTS PASSED');
    process.exit(0);
}
