#!/bin/bash

# ===========================================
# FINAULT NIGHTLY COMPOUND LOOP
# ===========================================
#
# This script runs every night to:
# 1. Review all agent sessions from the last 24 hours
# 2. Extract learnings and update AGENTS.md
# 3. Verify forecast accuracy against actuals
# 4. Identify and queue priority improvements
# 5. (Optional) Implement top priority item
#
# Schedule with cron:
# 30 22 * * * /path/to/finault-agentos/scripts/nightly-compound.sh
#
# Or use launchd on macOS (see docs)

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/compound-$(date +%Y-%m-%d).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handler
handle_error() {
    log "ERROR: Script failed on line $1"
    # Send alert (configure with your notification system)
    # curl -X POST "$SLACK_WEBHOOK" -d '{"text":"Finault nightly compound failed!"}'
    exit 1
}

trap 'handle_error $LINENO' ERR

# ===========================================
# MAIN EXECUTION
# ===========================================

log "🌙 Starting Finault Nightly Compound Loop"
log "=========================================="

cd "$PROJECT_DIR"

# Load environment
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Step 1: Pull latest code (if using git)
if [ -d ".git" ]; then
    log "📥 Pulling latest code..."
    git fetch origin main 2>&1 | tee -a "$LOG_FILE"
    git reset --hard origin/main 2>&1 | tee -a "$LOG_FILE"
fi

# Step 2: Run compound learning
log "🧠 Running compound learning agent..."

# Call the compound learning endpoint
COMPOUND_RESULT=$(curl -s -X POST "http://localhost:${PORT:-8000}/api/v1/learning/compound" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${INTERNAL_API_KEY:-dev-key}")

log "Compound result: $COMPOUND_RESULT"

# Step 3: Check for priority items
log "🎯 Checking priority improvements..."

PRIORITIES=$(curl -s "http://localhost:${PORT:-8000}/api/v1/learning/priorities" \
    -H "Authorization: Bearer ${INTERNAL_API_KEY:-dev-key}")

log "Priorities: $PRIORITIES"

# Step 4: Commit any updates to AGENTS.md
if [ -f "AGENTS.md" ]; then
    if ! git diff --quiet AGENTS.md 2>/dev/null; then
        log "📝 Committing AGENTS.md updates..."
        git add AGENTS.md
        git commit -m "chore: nightly compound learning update

Automated update from compound learning agent.
Reviewed sessions from last 24 hours.

Co-Authored-By: Finault AgentOS <noreply@finault.com>"
        git push origin main 2>&1 | tee -a "$LOG_FILE"
    else
        log "No changes to AGENTS.md"
    fi
fi

# Step 5: Generate summary
log "📊 Generating nightly summary..."

SUMMARY="Finault Nightly Compound Complete

Time: $(date)

Sessions Reviewed: $(echo $COMPOUND_RESULT | jq -r '.steps[0].result.sessions_reviewed // 0')
Learnings Extracted: $(echo $COMPOUND_RESULT | jq -r '.steps[0].result.learnings | length // 0')
Forecasts Verified: $(echo $COMPOUND_RESULT | jq -r '.steps[2].result.forecasts_verified // 0')
Priority Items: $(echo $PRIORITIES | jq -r '.priorities | length // 0')
"

log "$SUMMARY"

# Optional: Send summary notification
if [ -n "$SLACK_WEBHOOK" ]; then
    curl -s -X POST "$SLACK_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"$SUMMARY\"}"
fi

log "✅ Nightly compound complete!"
log "=========================================="
