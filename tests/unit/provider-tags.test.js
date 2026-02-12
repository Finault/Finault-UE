/**
 * Unit tests for Provider Tags Module
 * Run: node tests/unit/provider-tags.test.js
 */

const providerTags = require('../../apps/gateway/modules/provider-tags.js');

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

console.log('Testing Provider Tags Module\n');

// ============================================================================
// Test: extractClientTags parses x-finault-tags JSON header
// ============================================================================
try {
  console.log('extractClientTags() - JSON header parsing:');

  const headers = {
    'x-finault-tags': JSON.stringify({ project: 'proj-123', team: 'ml-team' })
  };

  const tags = providerTags.extractClientTags(headers);

  assert(tags !== null, 'Tags extracted from x-finault-tags header');
  assert(tags.project === 'proj-123', 'Project tag extracted from JSON');
  assert(tags.team === 'ml-team', 'Team tag extracted from JSON');

} catch (err) {
  failed++;
  console.error(`  ✗ extractClientTags threw error: ${err.message}`);
}

// ============================================================================
// Test: extractClientTags reads individual headers
// ============================================================================
try {
  console.log('\nextractClientTags() - Individual header parsing:');

  const headers = {
    'x-finault-project': 'project-alpha',
    'x-finault-team': 'platform-eng',
    'x-finault-environment': 'production'
  };

  const tags = providerTags.extractClientTags(headers);

  assert(tags.project === 'project-alpha', 'x-finault-project header parsed');
  assert(tags.team === 'platform-eng', 'x-finault-team header parsed');
  assert(tags.environment === 'production', 'x-finault-environment header parsed');

} catch (err) {
  failed++;
  console.error(`  ✗ Individual header parsing threw error: ${err.message}`);
}

// ============================================================================
// Test: extractProviderTags extracts OpenAI user field
// ============================================================================
try {
  console.log('\nextractProviderTags() - Provider-specific fields:');

  const requestBody = {
    user: 'user-org-123'
  };

  const tags = providerTags.extractProviderTags('openai', requestBody, 'https://api.openai.com/v1/chat/completions');

  assert(tags !== null, 'Provider tags extracted');
  assert('user' in tags, 'OpenAI user field extracted');
  assert(tags.user === 'user-org-123', 'User value is correct');

} catch (err) {
  failed++;
  console.error(`  ✗ extractProviderTags threw error: ${err.message}`);
}

// ============================================================================
// Test: normalizeTags lowercases keys and trims values
// ============================================================================
try {
  console.log('\nnormalizeTags() - Key and value normalization:');

  const tags = {
    'Project': 'PROJ-123  ',
    'TEAM': '  ml-eng',
    'Environment': 'Prod'
  };

  const normalized = providerTags.normalizeTags(tags);

  assert(Object.keys(normalized).every(k => k === k.toLowerCase()), 'All keys are lowercase');
  assert(normalized.project === 'PROJ-123', 'Values are trimmed');
  assert(normalized.team === 'ml-eng', 'Whitespace is removed');

} catch (err) {
  failed++;
  console.error(`  ✗ normalizeTags threw error: ${err.message}`);
}

// ============================================================================
// Test: validateTags rejects >50 tags
// ============================================================================
try {
  console.log('\nvalidateTags() - Tag count limit:');

  const tooManyTags = {};
  for (let i = 0; i < 51; i++) {
    tooManyTags[`tag-${i}`] = 'value';
  }

  const result = providerTags.validateTags(tooManyTags);

  assert(!result.valid, 'Validation fails for >50 tags');
  assert(result.errors && result.errors.length > 0, 'Error message provided for tag count');

} catch (err) {
  failed++;
  console.error(`  ✗ Tag count validation threw error: ${err.message}`);
}

// ============================================================================
// Test: validateTags rejects keys >64 chars
// ============================================================================
try {
  console.log('\nvalidateTags() - Key length limit:');

  const oversizedKey = {};
  oversizedKey['a'.repeat(65)] = 'value';

  const result = providerTags.validateTags(oversizedKey);

  assert(!result.valid, 'Validation fails for key >64 chars');
  assert(result.errors && result.errors.length > 0, 'Error message provided for key length');

} catch (err) {
  failed++;
  console.error(`  ✗ Key length validation threw error: ${err.message}`);
}

// ============================================================================
// Test: mergeTags applies correct priority (client > body > provider)
// ============================================================================
try {
  console.log('\nmergeTags() - Priority merging:');

  const clientTags = { project: 'client-proj', team: 'client-team' };
  const bodyTags = { project: 'body-proj', environment: 'staging' };
  const providerTags2 = { cost_center: 'cc-123' };

  const merged = providerTags.mergeTags(clientTags, bodyTags, providerTags2);

  assert(merged.project === 'client-proj', 'Client tags have highest priority');
  assert(merged.team === 'client-team', 'Client-only tags are included');
  assert(merged.environment === 'staging', 'Body tags used when not in client');
  assert(merged.cost_center === 'cc-123', 'Provider tags used as fallback');

} catch (err) {
  failed++;
  console.error(`  ✗ mergeTags threw error: ${err.message}`);
}

// ============================================================================
// Test: prepareForStorage separates reserved keys into columns
// ============================================================================
try {
  console.log('\nprepareForStorage() - Column separation:');

  const tags = {
    project: 'proj-123',
    team: 'ml-team',
    environment: 'prod',
    cost_center: 'cc-001',
    custom_tag: 'custom_value'
  };

  const storage = providerTags.prepareForStorage(tags);

  assert('reserved' in storage || 'columns' in storage, 'Storage format separates reserved from custom');
  assert(storage !== null, 'Storage format is generated');

} catch (err) {
  failed++;
  console.error(`  ✗ prepareForStorage threw error: ${err.message}`);
}

// ============================================================================
// Test: computeTagIntersection returns correct score
// ============================================================================
try {
  console.log('\ncomputeTagIntersection() - Scoring:');

  const tagsA = { project: 'proj-1', team: 'team-a', environment: 'prod' };
  const tagsB = { project: 'proj-1', team: 'team-a', region: 'us-east' };

  const result = providerTags.computeTagIntersection(tagsA, tagsB);

  assert(typeof result === 'object', 'Result is an object');
  assert('score' in result, 'Result has score field');
  assert(typeof result.score === 'number', 'Score is a number');
  assert(result.score >= 0 && result.score <= 1, 'Score is between 0 and 1');
  assert(result.score > 0.4, 'Score reflects 2 matching tags out of 5 unique (0.4+)');

} catch (err) {
  failed++;
  console.error(`  ✗ computeTagIntersection threw error: ${err.message}`);
}

// ============================================================================
// Test: TAG_CONFIG has expected shape
// ============================================================================
try {
  console.log('\nTAG_CONFIG validation:');

  const config = providerTags.TAG_CONFIG;

  assert(typeof config === 'object', 'TAG_CONFIG is an object');
  assert('MAX_TAGS_PER_REQUEST' in config || 'RESERVED_KEYS' in config, 'TAG_CONFIG has expected properties');
  assert('RESERVED_KEYS' in config, 'TAG_CONFIG has RESERVED_KEYS array');
  assert(Array.isArray(config.RESERVED_KEYS), 'RESERVED_KEYS is an array');
  assert(config !== null, 'TAG_CONFIG is not null');

} catch (err) {
  failed++;
  console.error(`  ✗ TAG_CONFIG validation threw error: ${err.message}`);
}

// ============================================================================
// Test: Valid tags pass validation
// ============================================================================
try {
  console.log('\nTag validation - Valid case:');

  const validTags = {
    project: 'proj-123',
    team: 'ml-eng',
    environment: 'production',
    cost_center: 'cc-001'
  };

  const result = providerTags.validateTags(validTags);

  assert(result.valid === true, 'Valid tags pass validation');

} catch (err) {
  failed++;
  console.error(`  ✗ Valid tags test threw error: ${err.message}`);
}

// ============================================================================
// Test: Empty tags are handled gracefully
// ============================================================================
try {
  console.log('\nEmpty tags handling:');

  const emptyTags = {};

  const result = providerTags.validateTags(emptyTags);

  assert(result.valid === true, 'Empty tags are valid');

} catch (err) {
  failed++;
  console.error(`  ✗ Empty tags test threw error: ${err.message}`);
}

// ============================================================================
// Test: Reserved keys are recognized
// ============================================================================
try {
  console.log('\nReserved keys recognition:');

  const config = providerTags.TAG_CONFIG;

  if (config.RESERVED_KEYS) {
    assert(Array.isArray(config.RESERVED_KEYS), 'RESERVED_KEYS is an array');
    assert(config.RESERVED_KEYS.length > 0, 'Reserved keys are defined');
    assert(config.RESERVED_KEYS.includes('cost_center'), 'Reserved keys include cost_center');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ Reserved keys test threw error: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
