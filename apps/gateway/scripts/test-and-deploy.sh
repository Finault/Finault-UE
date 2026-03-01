#!/bin/bash

##############################################################################
# Finault Gateway CI/CD Pipeline
# ═══════════════════════════════════════════════════════════════════════════
#
# Complete CI/CD workflow for the Finault Gateway:
# 1. Run test suite
# 2. Build gateway (src/ → gateway-wired.js)
# 3. Verify build artifacts
# 4. Deploy to Cloudflare (optional, manual)
#
# Usage:
#   ./scripts/test-and-deploy.sh
#   ./scripts/test-and-deploy.sh --deploy  # Auto-deploy after successful build
#
# Environment Variables:
#   GATEWAY_URL        - Gateway endpoint for testing (default: https://api.finault.ai)
#   DRY_RUN             - Set to 1 to skip actual deploy
#   WRANGLER_ENV        - Environment to deploy to (default: production)
#
##############################################################################

set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$GATEWAY_DIR/../.." && pwd)"
TEST_DIR="$REPO_ROOT/tests"

GATEWAY_URL="${GATEWAY_URL:-https://api.finault.ai}"
AUTO_DEPLOY="${AUTO_DEPLOY:-0}"
DRY_RUN="${DRY_RUN:-0}"
WRANGLER_ENV="${WRANGLER_ENV:-production}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ═══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

print_header() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
  echo ""
}

print_step() {
  echo -e "${YELLOW}→${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1: VALIDATE ENVIRONMENT
# ═══════════════════════════════════════════════════════════════════════════

validate_environment() {
  print_header "Step 0: Validate Environment"

  print_step "Checking Node.js..."
  if ! command -v node &> /dev/null; then
    print_error "Node.js not found"
    exit 1
  fi
  local node_version=$(node --version)
  print_success "Node.js $node_version"

  print_step "Checking gateway directory..."
  if [ ! -d "$GATEWAY_DIR" ]; then
    print_error "Gateway directory not found: $GATEWAY_DIR"
    exit 1
  fi
  print_success "Gateway directory: $GATEWAY_DIR"

  print_step "Checking source files..."
  if [ ! -f "$GATEWAY_DIR/src/index.js" ]; then
    print_error "Source file not found: $GATEWAY_DIR/src/index.js"
    exit 1
  fi
  print_success "Source files exist"

  print_step "Checking wrangler.toml..."
  if [ ! -f "$GATEWAY_DIR/wrangler.toml" ]; then
    print_error "wrangler.toml not found"
    exit 1
  fi
  print_success "wrangler.toml found"
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1: RUN TESTS
# ═══════════════════════════════════════════════════════════════════════════

run_tests() {
  print_header "Step 1: Run Gateway Test Suite"

  if [ ! -f "$TEST_DIR/gateway-test-suite.js" ]; then
    print_error "Test suite not found: $TEST_DIR/gateway-test-suite.js"
    echo "  Skipping tests (test file not present)"
    return 0
  fi

  print_step "Running test suite..."
  cd "$REPO_ROOT"

  if node "$TEST_DIR/gateway-test-suite.js"; then
    print_success "All tests passed"
    return 0
  else
    print_error "Tests failed!"
    exit 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2: BUILD GATEWAY
# ═══════════════════════════════════════════════════════════════════════════

build_gateway() {
  print_header "Step 2: Build Gateway"

  print_step "Running build script..."
  cd "$GATEWAY_DIR"

  if node "$SCRIPT_DIR/build.js"; then
    print_success "Build completed successfully"
    return 0
  else
    print_error "Build failed!"
    exit 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 3: VERIFY BUILD ARTIFACTS
# ═══════════════════════════════════════════════════════════════════════════

verify_build() {
  print_header "Step 3: Verify Build Artifacts"

  local output_file="$GATEWAY_DIR/gateway-wired.js"

  print_step "Checking gateway-wired.js exists..."
  if [ ! -f "$output_file" ]; then
    print_error "gateway-wired.js not found"
    exit 1
  fi
  print_success "gateway-wired.js exists"

  print_step "Checking file size..."
  local file_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
  if [ "$file_size" -lt 1000 ]; then
    print_error "gateway-wired.js is too small ($file_size bytes)"
    exit 1
  fi
  print_success "File size: $(numfmt --to=iec-i --suffix=B "$file_size" 2>/dev/null || echo "$file_size bytes")"

  print_step "Running syntax check..."
  if node --check "$output_file"; then
    print_success "Syntax check passed"
  else
    print_error "Syntax check failed!"
    exit 1
  fi

  print_step "Checking for required exports..."
  if grep -q "export default" "$output_file"; then
    print_success "Default export found"
  else
    print_error "Default export not found!"
    exit 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# STEP 4: DEPLOY (OPTIONAL)
# ═══════════════════════════════════════════════════════════════════════════

deploy_gateway() {
  print_header "Step 4: Deploy Gateway"

  if [ "$DRY_RUN" == "1" ]; then
    print_step "DRY RUN MODE - Skipping actual deployment"
    return 0
  fi

  print_step "Checking wrangler..."
  if ! command -v wrangler &> /dev/null && ! npx wrangler --version &> /dev/null; then
    print_error "wrangler not found. Install with: npm install -g @cloudflare/wrangler"
    echo ""
    echo "Manual deployment steps:"
    echo "  1. cd $GATEWAY_DIR"
    echo "  2. npx wrangler deploy"
    return 0
  fi

  print_step "Deploying to environment: $WRANGLER_ENV..."
  cd "$GATEWAY_DIR"

  if npx wrangler deploy --env "$WRANGLER_ENV"; then
    print_success "Deployment successful!"
    return 0
  else
    print_error "Deployment failed!"
    exit 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

main() {
  print_header "Finault Gateway CI/CD Pipeline"
  echo "Gateway URL: $GATEWAY_URL"
  echo "Environment: $WRANGLER_ENV"
  echo "Time: $(date)"
  echo ""

  # Parse command line arguments
  for arg in "$@"; do
    case $arg in
      --deploy)
        AUTO_DEPLOY=1
        ;;
      --dry-run)
        DRY_RUN=1
        ;;
    esac
  done

  if [ "$AUTO_DEPLOY" == "1" ]; then
    echo "Auto-deploy enabled"
  fi
  echo ""

  # Run pipeline steps
  validate_environment
  run_tests
  build_gateway
  verify_build

  if [ "$AUTO_DEPLOY" == "1" ]; then
    deploy_gateway
  else
    echo ""
    echo -e "${YELLOW}Deploy command (run manually when ready):${NC}"
    echo "  cd $GATEWAY_DIR"
    echo "  npx wrangler deploy --env $WRANGLER_ENV"
    echo ""
  fi

  print_header "Pipeline Complete"
  echo "All checks passed! ✓"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════
# EXECUTION
# ═══════════════════════════════════════════════════════════════════════════

main "$@"
