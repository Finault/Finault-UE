# Finault Cost Check GitHub Action

Automatically estimates the cost impact of AI-related code changes in your pull requests. Scans for new API calls, model changes, and usage patterns to provide clear cost visibility before merging.

## Features

- **Detects AI API additions**: Identifies new OpenAI, Anthropic, and Google API calls
- **Model change tracking**: Flags upgrades (e.g., gpt-4o-mini → gpt-4o) with cost impact
- **Cost estimation**: Uses real pricing models to estimate monthly impact
- **PR comments**: Posts detailed cost analysis directly to PRs
- **Threshold alerts**: Optional warnings when cost increases exceed limits
- **CI/CD integration**: Can fail the check if cost exceeds threshold

## Supported Providers

- **OpenAI**: GPT-4o, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo, GPT-4o Mini
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
- **Google**: Gemini Pro, Gemini 1.5 Pro

## Usage

### Basic Setup

Add to your `.github/workflows/cost-check.yml`:

```yaml
name: Finault Cost Check

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  cost-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Finault Cost Check
        uses: ./github-action
        with:
          finault_api_key: ${{ secrets.FINAULT_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          threshold: '100'
          fail_on_exceed: 'false'
```

### With Threshold Enforcement

```yaml
- name: Run Finault Cost Check (Strict Mode)
  uses: ./github-action
  with:
    finault_api_key: ${{ secrets.FINAULT_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
    threshold: '50'
    fail_on_exceed: 'true'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `finault_api_key` | Yes | - | API key for Finault service |
| `github_token` | Yes | - | GitHub token for posting comments (use `${{ secrets.GITHUB_TOKEN }}`) |
| `threshold` | No | `100` | Cost threshold in USD for warning |
| `fail_on_exceed` | No | `false` | Fail the action if cost exceeds threshold |

## How It Works

1. **Detects Changes**: Scans PR diff for AI-related patterns
2. **Identifies Patterns**:
   - New API calls: `openai.ChatCompletion.create()`, `client.messages.create()`
   - Model specifications: `model="gpt-4o"`, `model: "claude-3-opus"`
   - AI endpoints: completions, chat.completions, embeddings
3. **Calculates Costs**: Uses real-time pricing models
4. **Posts Results**: Adds formatted comment to PR with cost breakdown

## Example Output

```
## 🔍 Finault Cost Check

| Change | Model | Est. Cost/Request | Monthly Impact |
|--------|-------|-------------------|----------------|
| Added GPT-4o call in /api/chat | GPT-4o | $0.0180 | +$5.40/mo |
| Upgraded model in /api/summary | gpt-4o-mini → gpt-4o | $0.0175 | +$5.25/mo |

**Total estimated monthly impact: +$10.65/mo**

_Powered by [Finault](https://finault.ai)_
```

## Environment Variables

The action uses the following environment variables:

- `INPUT_FINAULT_API_KEY`: Finault API key (from inputs)
- `INPUT_GITHUB_TOKEN`: GitHub token (from inputs)
- `INPUT_THRESHOLD`: Cost threshold (from inputs)
- `INPUT_FAIL_ON_EXCEED`: Whether to fail on threshold (from inputs)
- `GITHUB_EVENT_PATH`: Path to GitHub event JSON (set by GitHub Actions)
- `GITHUB_REPOSITORY`: Repository in format owner/repo (set by GitHub Actions)
- `GITHUB_PR_NUMBER`: Pull request number (derived from context)

## Limitations

- Estimates are based on average usage patterns (30 requests/month per API call)
- Actual costs may vary based on token usage and request frequency
- Custom models or deprecated models default to conservative estimates
- Requires PR context in GitHub Actions environment

## Security

- API keys are passed as action secrets (never logged)
- GitHub tokens are scoped to the current repository
- Cost data is posted only to PR comments (not stored externally)
- All processing happens in the action context

## Support

For issues, feature requests, or questions about Finault pricing, visit [finault.ai](https://finault.ai)
