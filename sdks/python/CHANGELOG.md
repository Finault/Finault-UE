# Changelog

## [1.0.0] - 2026-03-12

### Added
- `FinaultClient` — full API client with chat completions routing, budget management, anomaly detection, close packs
- `Finault` decorator class — `@finault.track_cost()` for automatic cost attribution
- `finault_seal` package — cryptographic sealed receipts with SHA-256 hash chains
- CLI commands: `finault init`, `finault sync`, `finault scan`, `finault score`, `finault close-pack`, `finault insights`, `finault dogfood`, `finault benchmark`
- Multi-provider sync: OpenAI, Anthropic, AWS Bedrock, Google Vertex AI, Azure OpenAI
- Session tracking with `finault.session()` context manager
- Exception hierarchy: `FinaultError`, `AuthenticationError`, `RateLimitError`, `ValidationError`, `APIError`
- Streaming support for chat completions
- Python 3.8-3.13 support
