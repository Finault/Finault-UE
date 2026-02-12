# ACPS - AI Cost and Provisioning Standard

The open standard for AI cost management.

## Quick Start

Parse an invoice:
```bash
curl -X POST https://finault-gateway.finault.workers.dev/v1/parse \
  -H 'Content-Type: text/csv' \
  -d 'date,model,tokens,cost
2026-01-15,gpt-4o,1000,0.05'
```

Generate a Close Pack:
```bash
curl -X POST https://finault-gateway.finault.workers.dev/v1/close-pack \
  -H 'Content-Type: application/json' \
  -d '{"csv": "...", "company": "Acme", "period": "2026-01"}'
```

## Files

- [ACPS-SPECIFICATION-v1.0.md](./ACPS-SPECIFICATION-v1.0.md) - Full specification

## Links

- Website: https://finault.ai
- API: https://finault-gateway.finault.workers.dev

## License

Apache 2.0
