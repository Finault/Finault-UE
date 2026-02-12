#!/bin/bash

echo "═══════════════════════════════════════════"
echo "  Finault Diamond-Tier Standards Test Suite"
echo "═══════════════════════════════════════════"
echo ""

TOTAL_PASS=0
TOTAL_FAIL=0
cd "$(dirname "$0")/.."

for test in tests/unit/focus-mapper.test.js tests/unit/icfr-framework.test.js tests/unit/cost-classifier.test.js tests/unit/provider-tags.test.js tests/unit/otel-bridge.test.js tests/unit/commitment-pricing.test.js tests/unit/evidence-collector.test.js; do
  echo "━━━ Running: $test ━━━"
  if node "$test" 2>&1; then
    echo ""
  else
    echo "  [SUITE FAILED]"
    echo ""
  fi
done

echo "═══════════════════════════════════════════"
echo "  All test suites complete"
echo "═══════════════════════════════════════════"
