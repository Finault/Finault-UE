#!/bin/bash

###############################################################################
# Finault Cost Gate Script
#
# Analyzes git diffs for AI-related cost changes and compares against a
# threshold. Exits with 0 if cost change is acceptable, 1 if it exceeds limit.
#
# Usage:
#   ./cost-gate.sh [--threshold PERCENT] [--api-key KEY] [--verbose]
#
# Environment Variables:
#   FINAULT_API_KEY       - API key for Finault service (required)
#   FINAULT_COST_THRESHOLD - Cost threshold as percentage (default: 10%)
#
###############################################################################

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
THRESHOLD="${FINAULT_COST_THRESHOLD:-10}"
API_KEY="${FINAULT_API_KEY:-}"
VERBOSE=false
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

log_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$*${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_debug() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${BLUE}DEBUG:${NC} $*" >&2
    fi
}

print_usage() {
    cat << EOF
Finault Cost Gate - AI Cost Change Detection

USAGE:
    cost-gate.sh [OPTIONS]

OPTIONS:
    --threshold PERCENT     Cost threshold percentage (default: 10%)
    --api-key KEY          Finault API key (or set FINAULT_API_KEY)
    --verbose              Enable debug output
    --help                 Show this help message

ENVIRONMENT VARIABLES:
    FINAULT_API_KEY            API key for Finault service
    FINAULT_COST_THRESHOLD     Cost threshold as percentage (default: 10)

EXIT CODES:
    0  Cost change acceptable (below threshold)
    1  Cost change exceeds threshold or error occurred

EXAMPLES:
    # Use default 10% threshold
    ./cost-gate.sh

    # Use custom threshold
    ./cost-gate.sh --threshold 5

    # With API key from environment
    FINAULT_API_KEY=sk_test_xxx ./cost-gate.sh

    # Verbose output
    ./cost-gate.sh --verbose

EOF
}

###############################################################################
# Argument Parsing
###############################################################################

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --threshold)
                THRESHOLD="$2"
                shift 2
                ;;
            --api-key)
                API_KEY="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

###############################################################################
# Validation
###############################################################################

validate_prerequisites() {
    log_header "Validating Prerequisites"

    # Check for required tools
    for cmd in git jq curl; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required tool not found: $cmd"
            exit 1
        fi
    done
    log_success "All required tools found (git, jq, curl)"

    # Check for API key
    if [[ -z "$API_KEY" ]]; then
        log_error "Finault API key not provided"
        log_info "Set FINAULT_API_KEY environment variable or use --api-key"
        exit 1
    fi
    log_success "Finault API key configured"

    # Validate threshold
    if ! [[ "$THRESHOLD" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
        log_error "Invalid threshold value: $THRESHOLD"
        log_info "Threshold must be a number (e.g., 10 or 10.5)"
        exit 1
    fi
    log_success "Cost threshold: ${THRESHOLD}%"

    # Check if in git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Not in a git repository"
        exit 1
    fi
    log_success "Git repository detected"
}

###############################################################################
# Git Diff Analysis
###############################################################################

get_git_diff() {
    # Determine the base branch/commit
    local base_ref="origin/main"
    local current_ref="HEAD"

    # Try common base references
    if git rev-parse --verify "origin/main" > /dev/null 2>&1; then
        base_ref="origin/main"
    elif git rev-parse --verify "origin/master" > /dev/null 2>&1; then
        base_ref="origin/master"
    elif git rev-parse --verify "main" > /dev/null 2>&1; then
        base_ref="main"
    elif git rev-parse --verify "master" > /dev/null 2>&1; then
        base_ref="master"
    fi

    log_debug "Base reference: $base_ref, Current: $current_ref"

    # Get the unified diff
    git diff "$base_ref"..."$current_ref" 2>/dev/null || git diff "$base_ref" "$current_ref" 2>/dev/null || git diff HEAD~1 HEAD 2>/dev/null || ""
}

extract_diff_stats() {
    local diff="$1"
    local diff_file="$TEMP_DIR/diff.patch"

    echo "$diff" > "$diff_file"

    # Count additions and removals
    local added_lines=$(grep -c "^+" "$diff_file" || echo 0)
    local removed_lines=$(grep -c "^-" "$diff_file" || echo 0)
    local total_changes=$((added_lines + removed_lines))

    log_debug "Diff statistics: +$added_lines lines, -$removed_lines lines"

    echo "$diff_file"
}

###############################################################################
# AI Pattern Detection
###############################################################################

detect_ai_patterns() {
    local diff_file="$1"

    log_info "Scanning for AI-related patterns..."

    # Create a JSON array of detected changes
    local json_changes="[]"

    # OpenAI patterns
    local openai_added=$(grep -E "^\+.*openai\.|^\+.*OpenAI|^\+.*gpt-" "$diff_file" 2>/dev/null | wc -l || echo 0)
    local openai_removed=$(grep -E "^-.*openai\.|^-.*OpenAI|^-.*gpt-" "$diff_file" 2>/dev/null | wc -l || echo 0)

    if [[ $openai_added -gt 0 ]] || [[ $openai_removed -gt 0 ]]; then
        log_debug "OpenAI changes detected: +$openai_added, -$openai_removed"
        json_changes=$(jq --argjson count "$openai_added" '.+=[{"provider":"OpenAI","type":"addition","count":$count}]' <<< "$json_changes")
    fi

    # Anthropic patterns
    local anthropic_added=$(grep -E "^\+.*anthropic\.|^\+.*Anthropic|^\+.*claude|^\+.*messages\.create" "$diff_file" 2>/dev/null | wc -l || echo 0)
    local anthropic_removed=$(grep -E "^-.*anthropic\.|^-.*Anthropic|^-.*claude|^-.*messages\.create" "$diff_file" 2>/dev/null | wc -l || echo 0)

    if [[ $anthropic_added -gt 0 ]] || [[ $anthropic_removed -gt 0 ]]; then
        log_debug "Anthropic changes detected: +$anthropic_added, -$anthropic_removed"
        json_changes=$(jq --argjson count "$anthropic_added" '.+=[{"provider":"Anthropic","type":"addition","count":$count}]' <<< "$json_changes")
    fi

    # Google Gemini patterns
    local google_added=$(grep -E "^\+.*gemini|^\+.*google\.generativeai|^\+.*GoogleGenerativeAI" "$diff_file" 2>/dev/null | wc -l || echo 0)
    local google_removed=$(grep -E "^-.*gemini|^-.*google\.generativeai|^-.*GoogleGenerativeAI" "$diff_file" 2>/dev/null | wc -l || echo 0)

    if [[ $google_added -gt 0 ]] || [[ $google_removed -gt 0 ]]; then
        log_debug "Google changes detected: +$google_added, -$google_removed"
        json_changes=$(jq --argjson count "$google_added" '.+=[{"provider":"Google","type":"addition","count":$count}]' <<< "$json_changes")
    fi

    # Model upgrade patterns (e.g., gpt-4o-mini -> gpt-4o)
    local model_upgrades=$(grep -E "^\+.*model.*gpt-4|^\+.*model.*claude-3" "$diff_file" 2>/dev/null | wc -l || echo 0)
    if [[ $model_upgrades -gt 0 ]]; then
        log_debug "Model upgrades detected: $model_upgrades"
        json_changes=$(jq --argjson count "$model_upgrades" '.+=[{"provider":"Model","type":"upgrade","count":$count}]' <<< "$json_changes")
    fi

    echo "$json_changes"
}

###############################################################################
# API Communication
###############################################################################

call_finault_api() {
    local endpoint="$1"
    local payload="$2"
    local api_url="https://api.finault.ai/v1${endpoint}"

    log_debug "Calling API: $api_url"

    local response
    response=$(curl -s -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -H "User-Agent: finault-cost-gate/1.0" \
        -d "$payload" \
        "$api_url" 2>&1)

    log_debug "API Response: $response"

    echo "$response"
}

###############################################################################
# Cost Analysis
###############################################################################

estimate_cost_impact() {
    local diff_file="$1"
    local ai_patterns="$2"

    log_header "Analyzing Cost Impact"

    local diff_content
    diff_content=$(cat "$diff_file")

    # Build payload for API call
    local payload
    payload=$(jq -n \
        --arg diff "$diff_content" \
        --argjson patterns "$ai_patterns" \
        '{diff: $diff, patterns: $patterns}')

    log_debug "Sending cost analysis request..."

    # Call Finault API
    local api_response
    api_response=$(call_finault_api "/cost-estimate" "$payload")

    # Check for API errors
    if echo "$api_response" | jq -e '.error' > /dev/null 2>&1; then
        local error_msg
        error_msg=$(echo "$api_response" | jq -r '.error.message // .error')
        log_error "API Error: $error_msg"
        return 1
    fi

    echo "$api_response"
}

###############################################################################
# Cost Gate Evaluation
###############################################################################

evaluate_cost_gate() {
    local cost_response="$1"

    log_header "Cost Gate Evaluation"

    # Extract cost metrics
    local old_cost
    local new_cost
    local cost_increase
    local cost_increase_pct

    old_cost=$(echo "$cost_response" | jq '.old_monthly_cost // 0')
    new_cost=$(echo "$cost_response" | jq '.new_monthly_cost // 0')
    cost_increase=$(echo "$cost_response" | jq '.cost_delta // 0')
    cost_increase_pct=$(echo "$cost_response" | jq '.cost_increase_percentage // 0')

    log_info "Current monthly cost: \$${old_cost}"
    log_info "New monthly cost:     \$${new_cost}"
    log_info "Cost increase:        \$${cost_increase} (${cost_increase_pct}%)"
    log_info "Threshold:            ${THRESHOLD}%"

    # Determine pass/fail
    if (( $(echo "$cost_increase_pct > $THRESHOLD" | bc -l) )); then
        log_warn "Cost increase (${cost_increase_pct}%) exceeds threshold (${THRESHOLD}%)"
        print_cost_summary "$cost_response" "FAILED"
        return 1
    else
        log_success "Cost increase is within acceptable threshold"
        print_cost_summary "$cost_response" "PASSED"
        return 0
    fi
}

print_cost_summary() {
    local cost_response="$1"
    local status="$2"

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}Cost Gate Status: ${NC}"

    if [[ "$status" == "PASSED" ]]; then
        echo -e "${GREEN}✓ PASSED${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi

    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

    # Print detailed breakdown if available
    if echo "$cost_response" | jq -e '.breakdown' > /dev/null 2>&1; then
        echo -e "\n${CYAN}Breakdown:${NC}"
        echo "$cost_response" | jq -r '.breakdown[] | "  \(.description): \(.amount)"' 2>/dev/null || true
    fi

    echo ""
}

###############################################################################
# Error Handling
###############################################################################

handle_error() {
    local line_no=$1
    local error_msg="${2:-Unknown error}"

    log_error "An error occurred at line $line_no: $error_msg"
    log_info "Cost gate evaluation failed due to error"

    exit 1
}

trap 'handle_error ${LINENO}' ERR

###############################################################################
# Main Execution
###############################################################################

main() {
    log_header "Finault Cost Gate"
    echo ""

    # Parse arguments
    parse_args "$@"

    # Validate prerequisites
    validate_prerequisites

    # Get git diff
    log_header "Analyzing Git Changes"
    local diff
    diff=$(get_git_diff)

    if [[ -z "$diff" ]]; then
        log_warn "No changes detected"
        log_success "Cost gate PASSED (no changes)"
        exit 0
    fi

    local diff_file
    diff_file=$(extract_diff_stats "$diff")
    log_success "Git diff extracted ($(wc -l < "$diff_file") lines)"

    # Detect AI patterns
    local ai_patterns
    ai_patterns=$(detect_ai_patterns "$diff_file")

    local pattern_count
    pattern_count=$(echo "$ai_patterns" | jq 'length')

    if [[ $pattern_count -eq 0 ]]; then
        log_warn "No AI-related patterns detected"
        log_success "Cost gate PASSED (no AI changes)"
        exit 0
    fi

    log_success "Detected $pattern_count AI-related change(s)"

    # Estimate cost impact
    local cost_response
    cost_response=$(estimate_cost_impact "$diff_file" "$ai_patterns")

    # Evaluate against threshold
    evaluate_cost_gate "$cost_response"
    local gate_result=$?

    if [[ $gate_result -eq 0 ]]; then
        log_success "Cost gate evaluation PASSED"
        exit 0
    else
        log_error "Cost gate evaluation FAILED"
        exit 1
    fi
}

# Run main function
main "$@"
