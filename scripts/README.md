# Finault Cost Gate Script

A production-ready bash script that enforces cost limits on AI API usage changes in your CI/CD pipeline. Analyzes git diffs for AI-related changes and compares estimated cost impact against a configurable threshold.

## Features

- **Automated cost analysis**: Scans diffs for OpenAI, Anthropic, and Google API changes
- **Threshold enforcement**: Configurable cost increase limits (default 10%)
- **CI/CD integration**: Works in any environment with git, curl, and jq
- **Colored output**: Clear, readable terminal output with status indicators
- **Debug mode**: Verbose logging for troubleshooting
- **Error handling**: Robust error detection and helpful error messages
- **No dependencies**: Uses only standard tools (bash, git, curl, jq)

## Installation

```bash
# Copy script to your project
cp cost-gate.sh ./scripts/

# Make executable
chmod +x ./scripts/cost-gate.sh

# Verify installation
./scripts/cost-gate.sh --help
```

## Quick Start

### Basic Usage

```bash
# Set API key and run with defaults (10% threshold)
export FINAULT_API_KEY="sk_test_..."
./scripts/cost-gate.sh
```

### Custom Threshold

```bash
./scripts/cost-gate.sh --threshold 5
```

### Verbose Mode

```bash
./scripts/cost-gate.sh --verbose
```

### Combined

```bash
FINAULT_API_KEY="sk_test_..." ./scripts/cost-gate.sh --threshold 5 --verbose
```

## Integration Examples

### GitHub Actions

```yaml
name: Cost Gate Check

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  cost-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for diff comparison

      - name: Run Finault Cost Gate
        env:
          FINAULT_API_KEY: ${{ secrets.FINAULT_API_KEY }}
        run: |
          ./scripts/cost-gate.sh --threshold 10

      - name: Comment on PR if cost check fails
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '⚠️ Cost gate check failed. Estimated cost increase exceeds threshold.'
            })
```

### GitLab CI/CD

```yaml
stages:
  - cost-check

cost-gate:
  stage: cost-check
  image: ubuntu:22.04
  before_script:
    - apt-get update && apt-get install -y git curl jq
  script:
    - export FINAULT_API_KEY="${FINAULT_API_KEY}"
    - ./scripts/cost-gate.sh --threshold 10
  only:
    - merge_requests
  allow_failure: false
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any

    environment {
        FINAULT_API_KEY = credentials('finault-api-key')
    }

    stages {
        stage('Cost Gate') {
            steps {
                sh '''
                    chmod +x ./scripts/cost-gate.sh
                    ./scripts/cost-gate.sh --threshold 10
                '''
            }
        }
    }

    post {
        failure {
            echo "Cost gate check failed!"
        }
    }
}
```

### Local Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-push

FINAULT_API_KEY=$FINAULT_API_KEY ./scripts/cost-gate.sh --threshold 5

if [ $? -ne 0 ]; then
    echo "Cost gate check failed. Cannot push."
    exit 1
fi
```

## Command-Line Options

```
USAGE:
    cost-gate.sh [OPTIONS]

OPTIONS:
    --threshold PERCENT     Cost threshold percentage (default: 10%)
    --api-key KEY          Finault API key (or set FINAULT_API_KEY env var)
    --verbose              Enable debug output
    --help                 Show help message

ENVIRONMENT VARIABLES:
    FINAULT_API_KEY            API key for Finault service
    FINAULT_COST_THRESHOLD     Cost threshold as percentage (default: 10)

EXIT CODES:
    0  Cost change acceptable (below threshold)
    1  Cost change exceeds threshold or error occurred
```

## How It Works

### Step 1: Validate Environment

- Checks for required tools: git, curl, jq
- Validates Finault API key
- Confirms we're in a git repository
- Validates cost threshold format

### Step 2: Get Git Diff

- Detects appropriate base branch (main, master, origin/main, origin/master)
- Generates unified diff between base and current branch
- Falls back to HEAD~1..HEAD if no base found

### Step 3: Scan for AI Patterns

Detects changes related to:

- **OpenAI**: `openai.`, `OpenAI`, `gpt-*` patterns
- **Anthropic**: `anthropic.`, `Anthropic`, `claude`, `messages.create`
- **Google**: `gemini`, `google.generativeai`, `GoogleGenerativeAI`
- **Model upgrades**: Changes in model specifications

### Step 4: Estimate Cost Impact

Sends diff and detected patterns to Finault API which:

- Analyzes current monthly AI costs
- Estimates new monthly AI costs with changes
- Calculates percentage and absolute increase
- Returns detailed breakdown

### Step 5: Evaluate Against Threshold

Compares cost increase percentage to configured threshold:

- **Below threshold**: Exit 0 (PASSED)
- **Above threshold**: Exit 1 (FAILED)
- **Error**: Exit 1 with error message

## Output Examples

### Successful Run (Within Threshold)

```
ℹ 🚀 Finault Cost Gate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Validating Prerequisites
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ All required tools found (git, jq, curl)
✓ Finault API key configured
✓ Cost threshold: 10%
✓ Git repository detected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Analyzing Git Changes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Git diff extracted (127 lines)

ℹ Scanning for AI-related patterns...
✓ Detected 3 AI-related change(s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Analyzing Cost Impact
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cost Gate Evaluation:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ Current monthly cost: $500
ℹ New monthly cost:     $535
ℹ Cost increase:        $35 (7%)
ℹ Threshold:            10%
✓ Cost increase is within acceptable threshold

═══════════════════════════════════════════════════════════
Cost Gate Status: ✓ PASSED
═══════════════════════════════════════════════════════════

✓ Cost gate evaluation PASSED
```

### Failed Run (Exceeds Threshold)

```
...
✓ Cost increase: $120 (15%)
✓ Threshold:             10%
⚠ Cost increase (15%) exceeds threshold (10%)

═══════════════════════════════════════════════════════════
Cost Gate Status: ✗ FAILED
═══════════════════════════════════════════════════════════

✗ Cost gate evaluation FAILED
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FINAULT_API_KEY` | Yes | - | API key for Finault service |
| `FINAULT_COST_THRESHOLD` | No | 10 | Cost threshold as percentage |

## Error Handling

The script provides clear error messages for common issues:

### Missing API Key
```
✗ Finault API key not provided
ℹ Set FINAULT_API_KEY environment variable or use --api-key
```

### Invalid Threshold
```
✗ Invalid threshold value: abc
ℹ Threshold must be a number (e.g., 10 or 10.5)
```

### Not in Git Repository
```
✗ Not in a git repository
```

### API Errors
```
✗ API Error: Invalid API key
```

### Missing Tools
```
✗ Required tool not found: jq
```

## Troubleshooting

### Debug Mode

Enable verbose output to see detailed execution:

```bash
./scripts/cost-gate.sh --verbose
```

This shows:
- Detected base reference and current ref
- Diff statistics
- AI pattern matches
- API request/response data
- Cost calculation details

### Common Issues

**"Not in a git repository"**
- Ensure you're running from within a git repository
- Ensure git is properly initialized

**"Required tool not found: jq"**
- Install jq: `apt-get install jq` (Ubuntu/Debian) or `brew install jq` (macOS)

**"Finault API key not provided"**
- Set via environment: `export FINAULT_API_KEY=sk_test_...`
- Or use flag: `./cost-gate.sh --api-key sk_test_...`

**"API Error: Invalid API key"**
- Verify API key is correct
- Check API key hasn't expired
- Ensure using correct Finault endpoint

**"No changes detected"**
- Normal if comparing identical branches
- Verify base branch selection is correct

## Security Considerations

- **API Key Handling**: Never hardcode API keys; use environment variables or CI/CD secrets
- **Diff Content**: Diff is only sent to Finault API for analysis; never logged locally
- **Exit Codes**: Use exit codes in CI/CD to enforce cost gates
- **Network**: HTTPS only for all API communication

## Performance

- Typical execution time: 2-10 seconds depending on diff size
- No local cost calculations; all analysis done server-side
- Minimal resource usage (git, curl, jq only)

## Versioning

Current version: 1.0

Compatible with:
- Bash 4.0+
- Any git version
- Standard curl/jq

## Support

For issues, feature requests, or questions:
- [Finault Documentation](https://docs.finault.ai)
- [Finault Support](https://support.finault.ai)
