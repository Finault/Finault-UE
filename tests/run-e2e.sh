#!/bin/bash
# Finault End-to-End Test Suite Runner
# Runs E2E tests and exits with appropriate code for CI/CD pipelines
#
# Usage:
#   ./run-e2e.sh [--verbose] [--filter=journey-name]
#
# Environment variables:
#   FINAULT_API_URL - Override API base URL (default: https://api.finault.ai)
#   FINAULT_TEST_KEY - Test API key (default: fk_test_default)

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$SCRIPT_DIR")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print header
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  FINAULT E2E TEST RUNNER                               ║${NC}"
echo -e "${BLUE}║  Using Node.js $(node --version)                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Node.js is available
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not installed${NC}"
  exit 1
fi

# Set defaults
API_URL="${FINAULT_API_URL:-https://api.finault.ai}"
TEST_KEY="${FINAULT_TEST_KEY:-fk_test_default}"

# Export for test script
export FINAULT_API_URL="$API_URL"
export FINAULT_TEST_KEY="$TEST_KEY"

echo -e "${BLUE}Configuration:${NC}"
echo "  API URL: $API_URL"
echo "  Test Key: ${TEST_KEY:0:15}..."
echo "  Node.js: $(node --version)"
echo ""

# Run the test suite with all arguments passed through
echo -e "${BLUE}Running test suite...${NC}"
echo ""

node "$SCRIPT_DIR/e2e-test-suite.js" "$@"
TEST_EXIT_CODE=$?

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed${NC}"
else
  echo -e "${RED}✗ Some tests failed (exit code: $TEST_EXIT_CODE)${NC}"
fi

exit $TEST_EXIT_CODE
