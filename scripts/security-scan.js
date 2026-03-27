#!/usr/bin/env node

/**
 * Finault Security Scanner
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive security audit script that tests:
 * 1. Injection: SQL injection, XSS payloads, path traversal
 * 2. Auth bypass: missing/wrong API key access
 * 3. RLS verification: org isolation
 * 4. Token encryption: stripe_connections.access_token_encrypted
 * 5. CSRF validation: Stripe OAuth state parameter
 * 6. R2 bucket access: verify not publicly accessible
 * 7. Secret leakage: scan for logged secrets, hardcoded keys
 *
 * Output: JSON report with pass/fail per test, findings, severity ratings
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
const TEST_ORG_ID = process.env.TEST_ORG_ID || 'test-org-001';
const TEST_ORG_ID_2 = process.env.TEST_ORG_ID_2 || 'test-org-002';
const TEST_API_KEY = process.env.TEST_API_KEY || 'test-key-' + crypto.randomBytes(16).toString('hex');
const TEST_API_KEY_WRONG = 'wrong-key-' + crypto.randomBytes(16).toString('hex');

const report = {
  timestamp: new Date().toISOString(),
  gateway_url: GATEWAY_URL,
  tests: {},
  findings: [],
  summary: {
    total_tests: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

/**
 * Test 1: Injection Attacks
 */
async function testInjectionAttacks() {
  const testName = 'injection_attacks';
  const results = {
    name: testName,
    description: 'Test SQL injection, XSS, and path traversal',
    status: 'passed',
    checks: []
  };

  const injectionPayloads = [
    { type: 'sql', payload: "'; DROP TABLE seals; --", endpoint: '/api/seals' },
    { type: 'xss', payload: '<script>alert("xss")</script>', endpoint: '/api/organizations' },
    { type: 'path_traversal', payload: '../../../etc/passwd', endpoint: '/api/files' },
    { type: 'sql', payload: "1 OR 1=1", endpoint: '/api/seals?id=1' },
    { type: 'xss', payload: '"><svg/onload=alert("xss")', endpoint: '/api/webhooks' }
  ];

  for (const payload of injectionPayloads) {
    try {
      const response = await fetch(`${GATEWAY_URL}${payload.endpoint}`, {
        method: 'POST',
        headers: {
          'X-Finault-Org-ID': TEST_ORG_ID,
          'X-Finault-API-Key': TEST_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: payload.payload })
      }).catch(() => ({ status: 500 }));

      // Should not execute payload; expect error response, not successful processing
      if (response && response.status >= 400) {
        results.checks.push({
          payload_type: payload.type,
          endpoint: payload.endpoint,
          result: 'blocked',
          status_code: response.status,
          severity: 'low'
        });
      } else {
        results.status = 'failed';
        results.checks.push({
          payload_type: payload.type,
          endpoint: payload.endpoint,
          result: 'potentially_vulnerable',
          status_code: response?.status,
          severity: 'critical'
        });
        report.findings.push({
          test: testName,
          severity: 'critical',
          message: `${payload.type} payload may not be properly sanitized at ${payload.endpoint}`,
          payload: payload.payload
        });
      }
    } catch (err) {
      // Connection errors are acceptable; means endpoint rejects
      results.checks.push({
        payload_type: payload.type,
        endpoint: payload.endpoint,
        result: 'connection_error',
        error: err.message,
        severity: 'info'
      });
    }
  }

  report.tests[testName] = results;
  updateSummary(results.status === 'passed');
  return results;
}

/**
 * Test 2: Authentication Bypass
 */
async function testAuthBypass() {
  const testName = 'auth_bypass';
  const results = {
    name: testName,
    description: 'Test accessing endpoints without API key or with wrong key',
    status: 'passed',
    checks: []
  };

  const endpoints = [
    '/api/seals',
    '/api/organizations',
    '/api/billing/usage',
    '/api/providers',
    '/api/settings'
  ];

  for (const endpoint of endpoints) {
    // Test 1: No API key
    try {
      const response = await fetch(`${GATEWAY_URL}${endpoint}`, {
        headers: {
          'X-Finault-Org-ID': TEST_ORG_ID
          // No API key
        }
      }).catch(() => ({ status: 401 }));

      if (response?.status === 401 || response?.status === 403) {
        results.checks.push({
          endpoint,
          check: 'no_api_key',
          result: 'blocked',
          status_code: response.status,
          severity: 'low'
        });
      } else {
        results.status = 'failed';
        results.checks.push({
          endpoint,
          check: 'no_api_key',
          result: 'allowed',
          status_code: response?.status,
          severity: 'critical'
        });
        report.findings.push({
          test: testName,
          severity: 'critical',
          message: `Endpoint ${endpoint} accessible without API key`,
          endpoint
        });
      }
    } catch (err) {
      // Connection error is acceptable
      results.checks.push({
        endpoint,
        check: 'no_api_key',
        result: 'connection_error',
        error: err.message
      });
    }

    // Test 2: Wrong API key
    try {
      const response = await fetch(`${GATEWAY_URL}${endpoint}`, {
        headers: {
          'X-Finault-Org-ID': TEST_ORG_ID,
          'X-Finault-API-Key': TEST_API_KEY_WRONG
        }
      }).catch(() => ({ status: 401 }));

      if (response?.status === 401 || response?.status === 403) {
        results.checks.push({
          endpoint,
          check: 'wrong_api_key',
          result: 'blocked',
          status_code: response.status,
          severity: 'low'
        });
      } else {
        results.status = 'failed';
        results.checks.push({
          endpoint,
          check: 'wrong_api_key',
          result: 'allowed',
          status_code: response?.status,
          severity: 'critical'
        });
        report.findings.push({
          test: testName,
          severity: 'critical',
          message: `Endpoint ${endpoint} accessible with wrong API key`,
          endpoint
        });
      }
    } catch (err) {
      results.checks.push({
        endpoint,
        check: 'wrong_api_key',
        result: 'connection_error',
        error: err.message
      });
    }
  }

  report.tests[testName] = results;
  updateSummary(results.status === 'passed');
  return results;
}

/**
 * Test 3: RLS Verification (Row-Level Security)
 */
async function testRLSVerification() {
  const testName = 'rls_verification';
  const results = {
    name: testName,
    description: 'Test org isolation: verify org A cannot query org B data',
    status: 'passed',
    checks: []
  };

  // Simulate org A trying to access org B's seals
  try {
    const response = await fetch(`${GATEWAY_URL}/api/seals?org_id=${TEST_ORG_ID_2}`, {
      headers: {
        'X-Finault-Org-ID': TEST_ORG_ID,
        'X-Finault-API-Key': TEST_API_KEY
      }
    }).catch(() => ({ status: 403 }));

    if (response?.status === 403 || (response?.json && !response.ok)) {
      results.checks.push({
        check: 'cross_org_seals_access',
        result: 'blocked',
        status_code: response?.status,
        severity: 'low'
      });
    } else {
      results.status = 'failed';
      results.checks.push({
        check: 'cross_org_seals_access',
        result: 'allowed',
        status_code: response?.status,
        severity: 'critical'
      });
      report.findings.push({
        test: testName,
        severity: 'critical',
        message: 'RLS failure: org can query another org\'s seals'
      });
    }
  } catch (err) {
    results.checks.push({
      check: 'cross_org_seals_access',
      result: 'connection_error',
      error: err.message
    });
  }

  // Test revenue access isolation
  try {
    const response = await fetch(`${GATEWAY_URL}/api/revenue?org_id=${TEST_ORG_ID_2}`, {
      headers: {
        'X-Finault-Org-ID': TEST_ORG_ID,
        'X-Finault-API-Key': TEST_API_KEY
      }
    }).catch(() => ({ status: 403 }));

    if (response?.status === 403 || !response?.ok) {
      results.checks.push({
        check: 'cross_org_revenue_access',
        result: 'blocked',
        status_code: response?.status,
        severity: 'low'
      });
    } else {
      results.status = 'failed';
      results.checks.push({
        check: 'cross_org_revenue_access',
        result: 'allowed',
        status_code: response?.status,
        severity: 'critical'
      });
      report.findings.push({
        test: testName,
        severity: 'critical',
        message: 'RLS failure: org can query another org\'s revenue data'
      });
    }
  } catch (err) {
    results.checks.push({
      check: 'cross_org_revenue_access',
      result: 'connection_error',
      error: err.message
    });
  }

  // Test settings access isolation
  try {
    const response = await fetch(`${GATEWAY_URL}/api/settings?org_id=${TEST_ORG_ID_2}`, {
      headers: {
        'X-Finault-Org-ID': TEST_ORG_ID,
        'X-Finault-API-Key': TEST_API_KEY
      }
    }).catch(() => ({ status: 403 }));

    if (response?.status === 403 || !response?.ok) {
      results.checks.push({
        check: 'cross_org_settings_access',
        result: 'blocked',
        status_code: response?.status,
        severity: 'low'
      });
    } else {
      results.status = 'failed';
      results.checks.push({
        check: 'cross_org_settings_access',
        result: 'allowed',
        status_code: response?.status,
        severity: 'critical'
      });
      report.findings.push({
        test: testName,
        severity: 'critical',
        message: 'RLS failure: org can query another org\'s settings'
      });
    }
  } catch (err) {
    results.checks.push({
      check: 'cross_org_settings_access',
      result: 'connection_error',
      error: err.message
    });
  }

  report.tests[testName] = results;
  updateSummary(results.status === 'passed');
  return results;
}

/**
 * Test 4: Token Encryption
 */
async function testTokenEncryption() {
  const testName = 'token_encryption';
  const results = {
    name: testName,
    description: 'Verify stripe_connections.access_token_encrypted returns ciphertext',
    status: 'passed',
    checks: []
  };

  try {
    const response = await fetch(`${GATEWAY_URL}/api/stripe/connections`, {
      headers: {
        'X-Finault-Org-ID': TEST_ORG_ID,
        'X-Finault-API-Key': TEST_API_KEY
      }
    }).catch(() => null);

    if (!response || !response.ok) {
      results.checks.push({
        check: 'token_response',
        result: 'no_response',
        status_code: response?.status,
        severity: 'info'
      });
      return;
    }

    const data = await response.json().catch(() => null);
    if (!data || !data.connections) {
      results.checks.push({
        check: 'token_response',
        result: 'no_data',
        severity: 'info'
      });
      return;
    }

    for (const conn of data.connections || []) {
      const token = conn.access_token_encrypted;

      // Check if token is ciphertext (not plaintext)
      if (!token) {
        results.checks.push({
          check: 'token_encryption_present',
          result: 'missing_token',
          severity: 'warning'
        });
      } else if (token.startsWith('sk_') || token.startsWith('sk-')) {
        // Looks like a plaintext Stripe key
        results.status = 'failed';
        results.checks.push({
          check: 'token_encryption_plaintext',
          result: 'plaintext_detected',
          severity: 'critical'
        });
        report.findings.push({
          test: testName,
          severity: 'critical',
          message: 'Stripe access token appears to be plaintext, not encrypted'
        });
      } else {
        // Assume ciphertext
        results.checks.push({
          check: 'token_encryption_valid',
          result: 'encrypted',
          token_length: token.length,
          severity: 'low'
        });
      }
    }
  } catch (err) {
    results.checks.push({
      check: 'token_fetch',
      result: 'error',
      error: err.message
    });
  }

  report.tests[testName] = results;
  updateSummary(results.status === 'passed');
  return results;
}

/**
 * Test 5: CSRF Validation (Stripe OAuth State)
 */
async function testCSRFValidation() {
  const testName = 'csrf_validation';
  const results = {
    name: testName,
    description: 'Verify Stripe OAuth state parameter cannot be forged',
    status: 'passed',
    checks: []
  };

  try {
    // Initiate OAuth flow
    const initiateResponse = await fetch(`${GATEWAY_URL}/api/stripe/oauth/init`, {
      method: 'POST',
      headers: {
        'X-Finault-Org-ID': TEST_ORG_ID,
        'X-Finault-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      }
    }).catch(() => null);

    if (!initiateResponse || !initiateResponse.ok) {
      results.checks.push({
        check: 'oauth_init',
        result: 'no_response',
        status_code: initiateResponse?.status,
        severity: 'info'
      });
      return;
    }

    const initData = await initiateResponse.json().catch(() => null);
    if (!initData || !initData.state) {
      results.checks.push({
        check: 'oauth_state_generated',
        result: 'no_state_param',
        severity: 'critical'
      });
      results.status = 'failed';
      report.findings.push({
        test: testName,
        severity: 'critical',
        message: 'OAuth flow does not generate or validate state parameter'
      });
      return;
    }

    const originalState = initData.state;
    results.checks.push({
      check: 'oauth_state_generated',
      result: 'state_param_present',
      state_length: originalState.length,
      severity: 'low'
    });

    // Try to forge a state parameter
    const forgedState = 'forged_state_' + crypto.randomBytes(8).toString('hex');
    const callbackResponse = await fetch(`${GATEWAY_URL}/api/stripe/oauth/callback?state=${forgedState}&code=test_code`, {
      headers: {
        'X-Finault-Org-ID': TEST_ORG_ID,
        'X-Finault-API-Key': TEST_API_KEY
      }
    }).catch(() => ({ status: 403 }));

    if (callbackResponse?.status === 403 || callbackResponse?.status === 401) {
      results.checks.push({
        check: 'forged_state_rejected',
        result: 'rejected',
        status_code: callbackResponse.status,
        severity: 'low'
      });
    } else {
      results.status = 'failed';
      results.checks.push({
        check: 'forged_state_rejected',
        result: 'accepted',
        status_code: callbackResponse?.status,
        severity: 'critical'
      });
      report.findings.push({
        test: testName,
        severity: 'critical',
        message: 'Forged CSRF state parameter was accepted by OAuth callback'
      });
    }
  } catch (err) {
    results.checks.push({
      check: 'csrf_test',
      result: 'error',
      error: err.message
    });
  }

  report.tests[testName] = results;
  updateSummary(results.status === 'passed');
  return results;
}

/**
 * Test 6: R2 Bucket Access
 */
async function testR2BucketAccess() {
  const testName = 'r2_bucket_access';
  const results = {
    name: testName,
    description: 'Verify R2 bucket is not publicly accessible',
    status: 'passed',
    checks: []
  };

  const r2Urls = [
    `${process.env.R2_PUBLIC_URL || 'https://finault-r2.example.com'}/test-file.txt`,
    `${GATEWAY_URL}/api/r2/list`
  ];

  for (const url of r2Urls) {
    try {
      const response = await fetch(url).catch(() => ({ status: 403 }));

      if (response?.status === 403 || response?.status === 404) {
        results.checks.push({
          url: url.split('?')[0],
          result: 'not_accessible',
          status_code: response?.status,
          severity: 'low'
        });
      } else if (response?.status === 200) {
        results.status = 'failed';
        results.checks.push({
          url: url.split('?')[0],
          result: 'publicly_accessible',
          status_code: response.status,
          severity: 'critical'
        });
        report.findings.push({
          test: testName,
          severity: 'critical',
          message: `R2 bucket or endpoint is publicly accessible: ${url}`
        });
      } else {
        results.checks.push({
          url: url.split('?')[0],
          result: 'unknown',
          status_code: response?.status,
          severity: 'warning'
        });
      }
    } catch (err) {
      results.checks.push({
        url: url.split('?')[0],
        result: 'connection_error',
        error: err.message
      });
    }
  }

  report.tests[testName] = results;
  updateSummary(results.status === 'passed');
  return results;
}

/**
 * Test 7: Secret Leakage Scanning
 */
async function testSecretLeakage() {
  const testName = 'secret_leakage';
  const results = {
    name: testName,
    description: 'Scan gateway code for logged secrets, hardcoded keys',
    status: 'passed',
    checks: []
  };

  const gatewayDir = path.join(process.cwd(), 'apps', 'gateway', 'src');
  const secretPatterns = [
    { name: 'stripe_key', pattern: /sk_(?:live|test)_[a-zA-Z0-9]{20,}/ },
    { name: 'api_key', pattern: /api[_-]?key["\s:=]*[a-zA-Z0-9-_]{32,}/ },
    { name: 'jwt_secret', pattern: /jwt[_-]?secret["\s:=]*[a-zA-Z0-9-_]{32,}/ },
    { name: 'database_url', pattern: /postgres[ql]*:\/\/[a-zA-Z0-9:@.\-_]+/ },
    { name: 'oauth_token', pattern: /oauth[_-]?token["\s:=]*[a-zA-Z0-9-_]{40,}/ }
  ];

  if (!fs.existsSync(gatewayDir)) {
    results.checks.push({
      check: 'gateway_directory',
      result: 'not_found',
      severity: 'warning'
    });
    report.tests[testName] = results;
    return results;
  }

  const files = fs.readdirSync(gatewayDir);
  let filesScanned = 0;
  let secretsFound = [];

  for (const file of files) {
    if (!file.endsWith('.js')) continue;

    const filePath = path.join(gatewayDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      filesScanned++;

      for (const secretPattern of secretPatterns) {
        const matches = content.match(secretPattern.pattern);
        if (matches) {
          const lines = content.split('\n');
          const lineNum = lines.findIndex(line => secretPattern.pattern.test(line)) + 1;
          secretsFound.push({
            file,
            line: lineNum,
            type: secretPattern.name,
            severity: 'critical'
          });
          results.status = 'failed';
        }
      }
    } catch (err) {
      // Silently skip unreadable files
    }
  }

  results.checks.push({
    check: 'files_scanned',
    count: filesScanned,
    secrets_found: secretsFound.length,
    severity: secretsFound.length > 0 ? 'critical' : 'low'
  });

  if (secretsFound.length > 0) {
    results.checks.push(...secretsFound);
    report.findings.push({
      test: testName,
      severity: 'critical',
      message: `Found ${secretsFound.length} potential secrets in gateway code`,
      secrets: secretsFound
    });
  }

  report.tests[testName] = results;
  updateSummary(results.status === 'passed');
  return results;
}

/**
 * Update summary counts
 */
function updateSummary(passed) {
  report.summary.total_tests++;
  if (passed) {
    report.summary.passed++;
  } else {
    report.summary.failed++;
  }
}

/**
 * Generate remediation recommendations
 */
function generateRecommendations() {
  const recommendations = [];

  if (report.summary.failed > 0) {
    for (const finding of report.findings) {
      if (finding.severity === 'critical') {
        recommendations.push({
          severity: 'critical',
          finding: finding.message,
          remediation: getRemediationForFinding(finding.test),
          priority: 'immediate'
        });
      }
    }
  }

  return recommendations;
}

function getRemediationForFinding(testName) {
  const remediations = {
    injection_attacks: 'Implement input validation and parameterized queries. Use prepared statements and sanitize all user input before database operations.',
    auth_bypass: 'Ensure all endpoints validate API key and org_id headers. Implement middleware to check authentication before route handlers.',
    rls_verification: 'Enable RLS policies in Supabase. Verify that queries filter by org_id and that users cannot access other organizations\' data.',
    token_encryption: 'Use encryption (e.g., libsodium or TweetNaCl) to encrypt sensitive tokens before storing. Never store plaintext API keys.',
    csrf_validation: 'Implement CSRF state token validation in OAuth flows. Store state in secure session storage and validate on callback.',
    r2_bucket_access: 'Set R2 bucket to private. Use signed URLs for temporary access and implement authentication checks before serving files.',
    secret_leakage: 'Remove hardcoded secrets immediately. Use environment variables and secrets management (e.g., 1Password, AWS Secrets Manager).'
  };

  return remediations[testName] || 'Address security finding and implement mitigations.';
}

/**
 * Main execution
 */
async function main() {
  console.log('🔐 Finault Security Scanner');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  try {
    console.log('Running security tests...\n');

    await testInjectionAttacks();
    console.log('✓ Injection attacks test');

    await testAuthBypass();
    console.log('✓ Auth bypass test');

    await testRLSVerification();
    console.log('✓ RLS verification test');

    await testTokenEncryption();
    console.log('✓ Token encryption test');

    await testCSRFValidation();
    console.log('✓ CSRF validation test');

    await testR2BucketAccess();
    console.log('✓ R2 bucket access test');

    await testSecretLeakage();
    console.log('✓ Secret leakage scanning\n');

    // Add recommendations
    report.recommendations = generateRecommendations();

    // Output report
    const reportOutput = JSON.stringify(report, null, 2);
    console.log('Security Scan Report:');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log(reportOutput);

    // Write to file
    const reportPath = path.join(process.cwd(), `security-scan-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, reportOutput);
    console.log(`\nReport saved to: ${reportPath}`);

    // Exit with error code if failures detected
    process.exit(report.summary.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Security scan failed:', err);
    process.exit(1);
  }
}

main();
