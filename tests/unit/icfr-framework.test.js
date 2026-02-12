/**
 * Unit tests for ICFR Framework Module
 * Run: node tests/unit/icfr-framework.test.js
 */

const icfrFramework = require('../../platform/modules/icfr-framework.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log('Testing ICFR Framework Module\n');

// ============================================================================
// Test: generateControlMatrix returns control-to-assertion mapping
// ============================================================================
try {
  console.log('generateControlMatrix() - Control generation:');

  const matrix = icfrFramework.generateControlMatrix();

  assert(typeof matrix === 'object' && !Array.isArray(matrix), 'Result is an object (not array)');
  assert('AI-FIN-001' in matrix, 'Contains AI-FIN-001');
  assert('AI-FIN-002' in matrix, 'Contains AI-FIN-002');
  assert('AI-FIN-003' in matrix, 'Contains AI-FIN-003');
  assert('AI-FIN-004' in matrix, 'Contains AI-FIN-004');
  assert('AI-FIN-005' in matrix, 'Contains AI-FIN-005');
  assert('AI-FIN-006' in matrix, 'Contains AI-FIN-006');

  // Verify each control maps to assertions
  assert(typeof matrix['AI-FIN-001'] === 'object', 'AI-FIN-001 maps to assertion object');
  assert('PCAOB-AS-01' in matrix['AI-FIN-001'], 'AI-FIN-001 maps to PCAOB assertion');

} catch (err) {
  failed++;
  console.error(`  ✗ generateControlMatrix threw error: ${err.message}`);
}

// ============================================================================
// Test: Each control maps to at least one COSO component
// ============================================================================
try {
  console.log('\nControl-to-COSO mapping:');

  const controls = icfrFramework.FINAULT_CONTROLS;

  let allMapped = true;
  for (const control of controls) {
    if (!control.coso_component || control.coso_component.length === 0) {
      allMapped = false;
      console.error(`  ✗ Control ${control.id} has no COSO mapping`);
    }
  }

  assert(allMapped, 'All 6 controls map to at least one COSO component');

} catch (err) {
  failed++;
  console.error(`  ✗ COSO mapping test threw error: ${err.message}`);
}

// ============================================================================
// Test: Each control maps to at least one PCAOB assertion
// ============================================================================
try {
  console.log('\nControl-to-PCAOB mapping:');

  const controls = icfrFramework.FINAULT_CONTROLS;

  let allMapped = true;
  for (const control of controls) {
    if (!control.assertions || control.assertions.length === 0) {
      allMapped = false;
      console.error(`  ✗ Control ${control.id} has no PCAOB assertion mapping`);
    }
  }

  assert(allMapped, 'All 6 controls map to at least one PCAOB assertion');

} catch (err) {
  failed++;
  console.error(`  ✗ PCAOB assertion mapping threw error: ${err.message}`);
}

// ============================================================================
// Test: generateICFRReport produces valid report
// ============================================================================
try {
  console.log('\nGenerateICFRReport() - Report structure:');

  const report = icfrFramework.generateICFRReport('org-123', '2025-12-31', {
    controls: {
      'AI-FIN-001': { exceptionCount: 0, totalTransactions: 100, passedTransactions: 100, evidenceFiles: [] }
    }
  });

  assert(report !== null, 'Report is generated');
  assert(typeof report === 'object', 'Report is an object');
  assert('executiveSummary' in report, 'Report has executiveSummary field');
  assert('detailedControlAssessments' in report, 'Report has detailedControlAssessments field');
  assert('reportMetadata' in report, 'Report has reportMetadata field');

} catch (err) {
  failed++;
  console.error(`  ✗ generateICFRReport threw error: ${err.message}`);
}

// ============================================================================
// Test: getCloseCertificateLanguage returns PCAOB-compliant language
// ============================================================================
try {
  console.log('\ngetCloseCertificateLanguage() - Certificate language:');

  const report = icfrFramework.generateICFRReport('org-123', '2025-12-31', { controls: {} });
  const language = icfrFramework.getCloseCertificateLanguage(report);

  assert(typeof language === 'object', 'Language result is an object');
  assert('coveringStatement' in language, 'Language has coveringStatement field');
  assert(typeof language.coveringStatement === 'string', 'coveringStatement is a string');
  assert(language.coveringStatement.length > 0, 'Statement is not empty');
  assert(language.coveringStatement.includes('PCAOB') || language.coveringStatement.includes('AS 1105'), 'Statement includes PCAOB reference');

} catch (err) {
  failed++;
  console.error(`  ✗ getCloseCertificateLanguage threw error: ${err.message}`);
}

// ============================================================================
// Test: COSO_COMPONENTS has exactly 5 components
// ============================================================================
try {
  console.log('\nCOSO_COMPONENTS validation:');

  const components = icfrFramework.COSO_COMPONENTS;

  assert(typeof components === 'object', 'COSO_COMPONENTS is an object');
  const componentCount = Object.keys(components).length;
  assert(componentCount === 5, `COSO_COMPONENTS has exactly 5 components (got ${componentCount})`);

  // Verify component structure
  for (const [key, component] of Object.entries(components)) {
    assert(component.id, `Component ${key} has id`);
    assert(component.name, `Component ${key} has name`);
    assert(component.description, `Component ${key} has description`);
  }

} catch (err) {
  failed++;
  console.error(`  ✗ COSO_COMPONENTS validation threw error: ${err.message}`);
}

// ============================================================================
// Test: PCAOB_ASSERTIONS has exactly 6 assertions
// ============================================================================
try {
  console.log('\nPCAOB_ASSERTIONS validation:');

  const assertions = icfrFramework.PCAOB_ASSERTIONS;

  assert(typeof assertions === 'object', 'PCAOB_ASSERTIONS is an object');
  const assertionCount = Object.keys(assertions).length;
  assert(assertionCount === 6, `PCAOB_ASSERTIONS has exactly 6 assertions (got ${assertionCount})`);

  // Verify assertion structure
  for (const [key, assertion] of Object.entries(assertions)) {
    assert(assertion.id, `Assertion ${key} has id`);
    assert(assertion.name, `Assertion ${key} has name`);
    assert(assertion.description, `Assertion ${key} has description`);
  }

} catch (err) {
  failed++;
  console.error(`  ✗ PCAOB_ASSERTIONS validation threw error: ${err.message}`);
}

// ============================================================================
// Test: COSO component IDs follow expected pattern
// ============================================================================
try {
  console.log('\nCOSO component ID patterns:');

  const components = icfrFramework.COSO_COMPONENTS;
  let allValid = true;

  for (const component of Object.values(components)) {
    if (!component.id.startsWith('COSO-CC-')) {
      allValid = false;
      console.error(`  ✗ Invalid COSO ID: ${component.id}`);
    }
  }

  assert(allValid, 'All COSO component IDs follow COSO-CC-NN pattern');

} catch (err) {
  failed++;
  console.error(`  ✗ COSO ID pattern validation threw error: ${err.message}`);
}

// ============================================================================
// Test: PCAOB assertion IDs follow expected pattern
// ============================================================================
try {
  console.log('\nPCAOB assertion ID patterns:');

  const assertions = icfrFramework.PCAOB_ASSERTIONS;
  let allValid = true;

  for (const assertion of Object.values(assertions)) {
    if (!assertion.id.startsWith('PCAOB-AS-')) {
      allValid = false;
      console.error(`  ✗ Invalid PCAOB ID: ${assertion.id}`);
    }
  }

  assert(allValid, 'All PCAOB assertion IDs follow PCAOB-AS-NN pattern');

} catch (err) {
  failed++;
  console.error(`  ✗ PCAOB ID pattern validation threw error: ${err.message}`);
}

// ============================================================================
// Test: Control matrix has required fields
// ============================================================================
try {
  console.log('\nControl matrix field validation:');

  const controls = icfrFramework.FINAULT_CONTROLS;

  let allValid = true;
  for (const control of controls) {
    const requiredFields = ['id', 'name', 'description', 'coso_component', 'assertions'];
    for (const field of requiredFields) {
      if (!(field in control)) {
        allValid = false;
        console.error(`  ✗ Control ${control.id} missing field: ${field}`);
      }
    }
  }

  assert(allValid, 'All controls have required fields (id, name, description, coso_component, assertions)');

} catch (err) {
  failed++;
  console.error(`  ✗ Control field validation threw error: ${err.message}`);
}

// ============================================================================
// Test: Verify COSO component count by reference
// ============================================================================
try {
  console.log('\nCOSO framework reference validation:');

  const components = icfrFramework.COSO_COMPONENTS;
  const expectedComponentNames = [
    'Control Environment',
    'Risk Assessment',
    'Control Activities',
    'Information & Communication',
    'Monitoring Activities'
  ];

  let foundAll = true;
  for (const expectedName of expectedComponentNames) {
    const found = Object.values(components).some(c => c.name === expectedName);
    assert(found, `Found COSO component: ${expectedName}`);
  }

} catch (err) {
  failed++;
  console.error(`  ✗ COSO reference validation threw error: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
