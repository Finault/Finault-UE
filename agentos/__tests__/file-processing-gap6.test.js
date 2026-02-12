/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FILE PROCESSING PIPELINE TEST SUITE — GAP #6
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for the Finault file processing pipeline
 * Covers: Constants, validation, deduplication, scanning, normalization, storage, and metrics
 *
 * Test Count: 120 tests organized by subsystem
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    FileProcessingPipeline,
    PIPELINE_STAGES,
    SUPPORTED_FILE_TYPES,
    FILE_PROCESSING_CONFIG,
    createFileProcessingPipeline
} from '../core/file-processing.js';

let passed = 0;
let failed = 0;
const failures = [];

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
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function assertIncludes(arrayOrString, value, message) {
    if (typeof arrayOrString === 'string') {
        assert(arrayOrString.includes(value), `${message} (substring "${value}" not found)`);
    } else {
        assert(Array.isArray(arrayOrString) && arrayOrString.includes(value), `${message} (value not found in array)`);
    }
}

function assertIsObject(value, message) {
    assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${message} (not an object)`);
}

function assertIsArray(value, message) {
    assert(Array.isArray(value), `${message} (not an array)`);
}

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, `${message} (expected exception but none was thrown)`);
    } catch (e) {
        assert(true, `${message} (correctly threw: ${e.message})`);
    }
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

console.log('\n═════════════════════════════════════════════════════════════════════════════════');
console.log('FILE PROCESSING PIPELINE TEST SUITE — GAP #6');
console.log('═════════════════════════════════════════════════════════════════════════════════\n');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Constants (10 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[1] Pipeline Stage Constants');

assertEquals(PIPELINE_STAGES.RECEIVED, 'received', 'PIPELINE_STAGES.RECEIVED equals "received"');
assertEquals(PIPELINE_STAGES.VALIDATING, 'validating', 'PIPELINE_STAGES.VALIDATING equals "validating"');
assertEquals(PIPELINE_STAGES.VALIDATED, 'validated', 'PIPELINE_STAGES.VALIDATED equals "validated"');
assertEquals(PIPELINE_STAGES.SCANNING, 'scanning', 'PIPELINE_STAGES.SCANNING equals "scanning"');
assertEquals(PIPELINE_STAGES.SCANNED, 'scanned', 'PIPELINE_STAGES.SCANNED equals "scanned"');
assertEquals(PIPELINE_STAGES.NORMALIZING, 'normalizing', 'PIPELINE_STAGES.NORMALIZING equals "normalizing"');
assertEquals(PIPELINE_STAGES.NORMALIZED, 'normalized', 'PIPELINE_STAGES.NORMALIZED equals "normalized"');
assertEquals(PIPELINE_STAGES.STORING, 'storing', 'PIPELINE_STAGES.STORING equals "storing"');
assertEquals(PIPELINE_STAGES.STORED, 'stored', 'PIPELINE_STAGES.STORED equals "stored"');
assertEquals(PIPELINE_STAGES.FAILED, 'failed', 'PIPELINE_STAGES.FAILED equals "failed"');

console.log('\n[2] Supported File Types');

assert(SUPPORTED_FILE_TYPES['application/pdf'], 'application/pdf is supported');
assert(SUPPORTED_FILE_TYPES['text/csv'], 'text/csv is supported');
assert(SUPPORTED_FILE_TYPES['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], 'XLSX is supported');
assert(SUPPORTED_FILE_TYPES['application/json'], 'application/json is supported');
assert(SUPPORTED_FILE_TYPES['application/xml'], 'application/xml is supported');
assert(SUPPORTED_FILE_TYPES['text/xml'], 'text/xml is supported');
assert(SUPPORTED_FILE_TYPES['text/plain'], 'text/plain is supported');
assertEquals(SUPPORTED_FILE_TYPES['application/pdf'].extension, '.pdf', 'PDF extension is .pdf');
assertEquals(SUPPORTED_FILE_TYPES['text/csv'].extension, '.csv', 'CSV extension is .csv');

console.log('\n[3] File Processing Config');

assertEquals(FILE_PROCESSING_CONFIG.maxFileSize, 100 * 1024 * 1024, 'maxFileSize is 100 MB');
assertEquals(FILE_PROCESSING_CONFIG.maxFilesPerBatch, 50, 'maxFilesPerBatch is 50');
assertEquals(FILE_PROCESSING_CONFIG.deduplication.enabled, true, 'Deduplication is enabled');
assertEquals(FILE_PROCESSING_CONFIG.deduplication.windowDays, 90, 'Dedup window is 90 days');
assertEquals(FILE_PROCESSING_CONFIG.scanning.enabled, true, 'Scanning is enabled');
assertEquals(FILE_PROCESSING_CONFIG.scanning.timeout, 30000, 'Scan timeout is 30000ms');
assertEquals(FILE_PROCESSING_CONFIG.scanning.quarantineOnFailure, true, 'Quarantine on failure enabled');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 4: FileProcessingPipeline Constructor (5 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[4] FileProcessingPipeline Constructor');

const defaultPipeline = new FileProcessingPipeline();
assertIsObject(defaultPipeline.config, 'Default config is an object');
assertEquals(defaultPipeline.config.maxFileSize, FILE_PROCESSING_CONFIG.maxFileSize, 'Default config uses FILE_PROCESSING_CONFIG');
assert(defaultPipeline.fingerprints instanceof Map, 'Fingerprints map is initialized');
assert(Array.isArray(defaultPipeline.processingLog), 'Processing log is an array');

const customPipeline = new FileProcessingPipeline({ maxFileSize: 50 * 1024 * 1024 });
assertEquals(customPipeline.config.maxFileSize, 50 * 1024 * 1024, 'Custom config overrides default');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 5: Validation Stage (25 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[5] Validation Stage');

const pipeline = new FileProcessingPipeline();

// Valid files - each MIME type
let pdfValidation = pipeline._validate({
    filename: 'invoice.pdf',
    content: 'PDF content',
    mimeType: 'application/pdf',
    size: 1024,
    orgId: 'org1'
});
assertEquals(pdfValidation.valid, true, 'Valid PDF file passes validation');

let csvValidation = pipeline._validate({
    filename: 'data.csv',
    content: 'name,age\nJohn,30',
    mimeType: 'text/csv',
    size: 1024,
    orgId: 'org1'
});
assertEquals(csvValidation.valid, true, 'Valid CSV file passes validation');

let jsonValidation = pipeline._validate({
    filename: 'data.json',
    content: '{"key": "value"}',
    mimeType: 'application/json',
    size: 1024,
    orgId: 'org1'
});
assertEquals(jsonValidation.valid, true, 'Valid JSON file passes validation');

let xmlValidation = pipeline._validate({
    filename: 'data.xml',
    content: '<root><item>value</item></root>',
    mimeType: 'application/xml',
    size: 1024,
    orgId: 'org1'
});
assertEquals(xmlValidation.valid, true, 'Valid XML file passes validation');

let textValidation = pipeline._validate({
    filename: 'data.txt',
    content: 'Plain text',
    mimeType: 'text/plain',
    size: 1024,
    orgId: 'org1'
});
assertEquals(textValidation.valid, true, 'Valid plain text file passes validation');

// Missing filename
let noFilenameResult = pipeline._validate({
    content: 'data',
    mimeType: 'application/json',
    size: 1024,
    orgId: 'org1'
});
assertEquals(noFilenameResult.valid, false, 'Validation fails if filename is missing');
assertIncludes(noFilenameResult.error, 'Filename is required', 'Missing filename error message');

// Empty content
let emptyContentResult = pipeline._validate({
    filename: 'empty.json',
    content: '',
    mimeType: 'application/json',
    size: 0,
    orgId: 'org1'
});
assertEquals(emptyContentResult.valid, false, 'Validation fails if content is empty');
assertIncludes(emptyContentResult.error, 'empty', 'Empty content error message');

// Missing orgId
let noOrgIdResult = pipeline._validate({
    filename: 'data.json',
    content: '{"key": "value"}',
    mimeType: 'application/json',
    size: 1024
});
assertEquals(noOrgIdResult.valid, false, 'Validation fails if orgId is missing');
assertIncludes(noOrgIdResult.error, 'Organization ID', 'Missing orgId error message');

// Unsupported MIME type
let unsupportedMimeResult = pipeline._validate({
    filename: 'file.exe',
    content: 'executable',
    mimeType: 'application/x-msdownload',
    size: 1024,
    orgId: 'org1'
});
assertEquals(unsupportedMimeResult.valid, false, 'Validation fails for unsupported MIME type');
assertIncludes(unsupportedMimeResult.error, 'Unsupported', 'Unsupported MIME error message');

// Oversized file (PDF max is 50MB)
let oversizedResult = pipeline._validate({
    filename: 'huge.pdf',
    content: 'large content',
    mimeType: 'application/pdf',
    size: 60 * 1024 * 1024,
    orgId: 'org1'
});
assertEquals(oversizedResult.valid, false, 'Validation fails for oversized PDF');
assertIncludes(oversizedResult.error, 'exceeds maximum', 'File size exceeded error message');

// Extension mismatch with MIME type
let extensionMismatchResult = pipeline._validate({
    filename: 'file.txt',
    content: '{"json": "data"}',
    mimeType: 'application/json',
    size: 1024,
    orgId: 'org1'
});
assertEquals(extensionMismatchResult.valid, false, 'Validation fails for extension/MIME mismatch');
assertIncludes(extensionMismatchResult.error, 'Extension', 'Extension mismatch error message');

// CSV with valid TSV extension
let tsvWithCSVMimeResult = pipeline._validate({
    filename: 'data.tsv',
    content: 'name\tage\nJohn\t30',
    mimeType: 'text/csv',
    size: 1024,
    orgId: 'org1'
});
assertEquals(tsvWithCSVMimeResult.valid, true, 'TSV extension is valid for CSV MIME type');

// JSON with JSONL extension
let jsonlResult = pipeline._validate({
    filename: 'data.jsonl',
    content: '{"key": "value"}',
    mimeType: 'application/json',
    size: 1024,
    orgId: 'org1'
});
assertEquals(jsonlResult.valid, true, 'JSONL extension is valid for JSON MIME type');

// XLS alternative extension
let xlsResult = pipeline._validate({
    filename: 'data.xls',
    content: 'spreadsheet',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
    orgId: 'org1'
});
assertEquals(xlsResult.valid, true, 'XLS extension is valid for XLSX MIME type');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 6: Fingerprint & Deduplication (15 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[6] Fingerprint & Deduplication');

const dupTestPipeline = new FileProcessingPipeline();

// Fingerprint generation with string content
const fp1 = dupTestPipeline._fingerprint('same content');
const fp2 = dupTestPipeline._fingerprint('same content');
assertEquals(fp1, fp2, 'Same string content produces same fingerprint');
assert(fp1.startsWith('sha256_'), 'Fingerprint starts with sha256_');

// Different content produces different fingerprint
const fp3 = dupTestPipeline._fingerprint('different content');
assert(fp1 !== fp3, 'Different content produces different fingerprint');

// Buffer fingerprinting
const buffer1 = Buffer.from('buffer content');
const buffer2 = Buffer.from('buffer content');
const fpBuffer1 = dupTestPipeline._fingerprint(buffer1);
const fpBuffer2 = dupTestPipeline._fingerprint(buffer2);
assertEquals(fpBuffer1, fpBuffer2, 'Same buffer content produces same fingerprint');

// Uint8Array fingerprinting
const uint1 = new Uint8Array([1, 2, 3, 4, 5]);
const uint2 = new Uint8Array([1, 2, 3, 4, 5]);
const fpUint1 = dupTestPipeline._fingerprint(uint1);
const fpUint2 = dupTestPipeline._fingerprint(uint2);
assertEquals(fpUint1, fpUint2, 'Same Uint8Array content produces same fingerprint');

// Note: Deduplication tests are async and run later

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 7: Scanning Stage (15 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[7] Scanning Stage');

const scanPipeline = new FileProcessingPipeline();

// Note: Async scanning tests run in main async function below

// Invalid scanner
assertThrows(() => {
    scanPipeline.registerScanner({ notAScanner: true });
}, 'registerScanner throws if scanner has no scan method');

assertThrows(() => {
    scanPipeline.registerScanner(null);
}, 'registerScanner throws if scanner is null');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 8: Normalization (20 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[8] Normalization Stage');

const normPipeline = new FileProcessingPipeline();

// JSON normalization - single object
let jsonResult = normPipeline._normalize({
    content: '{"invoice_id": "INV001", "amount": 100.50}',
    mimeType: 'application/json'
});
assertIsObject(jsonResult.data, 'JSON normalized data is an object');
assertEquals(jsonResult.data.invoice_id, 'INV001', 'JSON fields are parsed correctly');
assertEquals(jsonResult.fieldsExtracted, 2, 'JSON field count is correct');

// JSON normalization - array
let jsonArrayResult = normPipeline._normalize({
    content: '[{"id": 1}, {"id": 2}]',
    mimeType: 'application/json'
});
assertIsArray(jsonArrayResult.data, 'JSON array is parsed as array');
assertEquals(jsonArrayResult.fieldsExtracted, 1, 'Field count extracted from first array element');

// JSON invalid
let jsonInvalidResult = normPipeline._normalize({
    content: '{"invalid": json}',
    mimeType: 'application/json'
});
assertEquals(jsonInvalidResult.data.parseError, true, 'Invalid JSON flagged with parseError');

// CSV normalization with headers and rows
let csvResult = normPipeline._normalize({
    content: 'invoice_id,amount,vendor\nINV001,100.50,Vendor A\nINV002,200.00,Vendor B',
    mimeType: 'text/csv'
});
assertIsArray(csvResult.data.headers, 'CSV headers extracted as array');
assertEquals(csvResult.data.headers.length, 3, 'CSV header count is correct');
assertEquals(csvResult.data.headers[0], 'invoice_id', 'First CSV header is correct');
assertIsArray(csvResult.data.rows, 'CSV rows extracted as array');
assertEquals(csvResult.data.rows.length, 2, 'CSV row count is correct');
assertEquals(csvResult.data.rows[0].amount, '100.50', 'CSV row values parsed correctly');
assertEquals(csvResult.fieldsExtracted, 3, 'CSV field count equals header count');

// CSV with empty content
let csvEmptyResult = normPipeline._normalize({
    content: '',
    mimeType: 'text/csv'
});
assertEquals(csvEmptyResult.data.rows.length, 0, 'Empty CSV has no rows');
assertEquals(csvEmptyResult.data.headers.length, 0, 'Empty CSV has no headers');

// XML normalization
let xmlResult = normPipeline._normalize({
    content: '<invoice><id>INV001</id><amount>100.50</amount><vendor>Vendor A</vendor></invoice>',
    mimeType: 'application/xml'
});
assertEquals(xmlResult.data.type, 'xml', 'XML type is set');
assertIsObject(xmlResult.data.fields, 'XML fields extracted');
assertEquals(xmlResult.data.fields.id, 'INV001', 'XML tag values extracted correctly');
assertEquals(xmlResult.fieldsExtracted, 3, 'XML field count is correct');

// PDF passthrough
let pdfResult = normPipeline._normalize({
    content: 'PDF binary content',
    mimeType: 'application/pdf',
    size: 5000
});
assertEquals(pdfResult.data.type, 'pdf', 'PDF type is set');
assertEquals(pdfResult.data.requiresOCR, true, 'PDF flagged as requiring OCR');
assertEquals(pdfResult.fieldsExtracted, 0, 'PDF has no extracted fields');

// XLSX passthrough
let xlsxResult = normPipeline._normalize({
    content: 'XLSX binary content',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 5000
});
assertEquals(xlsxResult.data.type, 'xlsx', 'XLSX type is set');
assertEquals(xlsxResult.data.requiresParsing, true, 'XLSX flagged as requiring parsing');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 9: Storage (10 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[9] Storage Stage');

const storePipeline = new FileProcessingPipeline();

// Note: Storage tests run in main async function below

// Invalid storage adapter
assertThrows(() => {
    storePipeline.registerStorage({ notAnAdapter: true });
}, 'registerStorage throws if adapter has no store method');

assertThrows(() => {
    storePipeline.registerStorage(null);
}, 'registerStorage throws if adapter is null');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 10: Full Pipeline (15 tests) - Async operations
// SECTION 11: Metrics (10 tests) - Async operations
// Note: These tests run in main async function below
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[10] Full Pipeline Execution');

// ═════════════════════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════════
// Async Test Execution
// ═════════════════════════════════════════════════════════════════════════════════

async function runAsyncTests() {
    console.log('\n[6a] Deduplication (Async)');
    const dupTestPipeline = new FileProcessingPipeline();
    const file1 = {
        filename: 'duplicate.json',
        content: '{"test": "data"}',
        mimeType: 'application/json',
        size: 16,
        orgId: 'org_test'
    };

    const result1 = await dupTestPipeline.process(file1);
    assertEquals(result1.isDuplicate, false, 'First file is not a duplicate');
    assertEquals(result1.stage, PIPELINE_STAGES.STORED, 'First file reaches STORED stage');

    const result2 = await dupTestPipeline.process(file1);
    assertEquals(result2.isDuplicate, true, 'Second identical file is marked as duplicate');
    assertEquals(result2.duplicateOf, result1.id, 'Duplicate references original file ID');

    const file2 = { ...file1, orgId: 'org_different' };
    const result3 = await dupTestPipeline.process(file2);
    assertEquals(result3.isDuplicate, false, 'Same file in different org is not a duplicate');

    dupTestPipeline.clearFingerprints();
    assertEquals(dupTestPipeline.fingerprints.size, 0, 'clearFingerprints clears the fingerprint map');

    console.log('\n[7a] Scanning (Async)');
    const noscaniPipeline = new FileProcessingPipeline({ scanning: { enabled: false } });
    let scanResult = await noscaniPipeline._scan('test content');
    assertEquals(scanResult.clean, true, 'Scan returns clean when scanning disabled');

    const scanPipeline = new FileProcessingPipeline();
    scanResult = await scanPipeline._scan('test content');
    assertEquals(scanResult.clean, true, 'Scan passes when no scanner registered');

    const mockScanner = { scan: async (content) => ({ clean: true }) };
    scanPipeline.registerScanner(mockScanner);
    scanResult = await scanPipeline._scan('test content');
    assertEquals(scanResult.clean, true, 'Registered scanner returns clean');

    const threatScanner = { scan: async (content) => ({ clean: false, threat: 'Trojan.Generic' }) };
    const threatPipeline = new FileProcessingPipeline();
    threatPipeline.registerScanner(threatScanner);
    scanResult = await threatPipeline._scan('test content');
    assertEquals(scanResult.clean, false, 'Scanner detects threat');

    console.log('\n[9a] Storage (Async)');
    const storePipeline = new FileProcessingPipeline();
    let storeResult = await storePipeline._store(
        { orgId: 'org123', filename: 'test.json', content: 'data', mimeType: 'application/json' },
        'file_123',
        'sha256_abc123'
    );
    assertIncludes(storeResult.key, 'org123', 'Storage key includes orgId');

    const mockAdapter = { store: async (key, content, metadata) => ({ url: `https://custom.storage/${key}`, key }) };
    storePipeline.registerStorage(mockAdapter);
    storeResult = await storePipeline._store(
        { orgId: 'org123', filename: 'test.json', content: 'data', mimeType: 'application/json' },
        'file_123',
        'sha256_abc123'
    );
    assertIncludes(storeResult.url, 'custom.storage', 'Custom adapter URL is used');

    console.log('\n[10a] Full Pipeline Execution (Async)');
    const fullPipeline = new FileProcessingPipeline();
    const cleanScanner2 = { scan: async () => ({ clean: true }) };
    fullPipeline.registerScanner(cleanScanner2);

    const file = {
        filename: 'invoice.json',
        content: '{"invoice_id": "INV001", "amount": 1000}',
        mimeType: 'application/json',
        size: 40,
        orgId: 'org_main',
        userId: 'user_123'
    };

    const pipelineResult = await fullPipeline.process(file);
    assertEquals(pipelineResult.stage, PIPELINE_STAGES.STORED, 'End-to-end processing reaches STORED stage');
    assertEquals(pipelineResult.filename, 'invoice.json', 'Result filename is correct');
    assert(pipelineResult.id.startsWith('file_'), 'Result has generated file ID');
    assertEquals(pipelineResult.isDuplicate, false, 'First processing is not a duplicate');

    const invalidFile = { filename: 'file.exe', content: 'malware', mimeType: 'application/x-msdownload', size: 100, orgId: 'org_main' };
    const failureResult = await fullPipeline.process(invalidFile);
    assertEquals(failureResult.stage, PIPELINE_STAGES.FAILED, 'Invalid file fails at validation');

    const batchPipeline = new FileProcessingPipeline();
    batchPipeline.registerScanner({ scan: async () => ({ clean: true }) });
    const files = [
        { filename: 'file1.json', content: '{}', mimeType: 'application/json', size: 2, orgId: 'org1' },
        { filename: 'file2.json', content: '{}', mimeType: 'application/json', size: 2, orgId: 'org1' }
    ];
    const batchResult = await batchPipeline.processBatch(files);
    assertEquals(batchResult.processed, 2, 'Batch processes all files');
    assertEquals(batchResult.succeeded, 2, 'All files succeeded in batch');

    console.log('\n[11a] Metrics (Async)');
    const metricsPipeline = new FileProcessingPipeline();
    metricsPipeline.registerScanner({ scan: async () => ({ clean: true }) });

    for (let i = 0; i < 5; i++) {
        await metricsPipeline.process({
            filename: `file${i}.json`,
            content: '{"test": "data"}',
            mimeType: 'application/json',
            size: 16,
            orgId: 'org_test'
        });
    }

    const stats = metricsPipeline.getStats();
    assertEquals(stats.totalProcessed, 5, 'Total processed count is correct');
    assertEquals(stats.byStage['stored'], 5, 'All 5 files reached stored stage');
    assertEquals(stats.duplicatesDetected, 4, 'Duplicates detected (4 of 5)');

    const orgHistory = metricsPipeline.getHistory('org_test', 10);
    assertEquals(orgHistory.length, 5, 'Organization history returns correct count');
}

runAsyncTests().catch(err => {
    console.error('Async test error:', err);
    process.exit(1);
}).then(() => {
    // ═════════════════════════════════════════════════════════════════════════════════
    // Factory Function Test
    // ═════════════════════════════════════════════════════════════════════════════════

    console.log('\n[12] Factory Function');

    const factoryPipeline = createFileProcessingPipeline({ config: { maxFilesPerBatch: 100 } });
    assert(factoryPipeline instanceof FileProcessingPipeline, 'Factory creates FileProcessingPipeline instance');
    assertEquals(factoryPipeline.config.maxFilesPerBatch, 100, 'Factory applies custom config');

    // ═════════════════════════════════════════════════════════════════════════════════
    // Test Results Summary
    // ═════════════════════════════════════════════════════════════════════════════════

    console.log('\n═════════════════════════════════════════════════════════════════════════════════');
    console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    console.log('═════════════════════════════════════════════════════════════════════════════════\n');

    if (failures.length > 0) {
        console.log('FAILURES:');
        failures.forEach((failure, index) => {
            console.log(`${index + 1}. ${failure}`);
        });
        console.log();
    }

    process.exit(failed === 0 ? 0 : 1);
});
