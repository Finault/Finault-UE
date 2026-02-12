# ACPS: AI Cost and Provisioning Standard v1.0

## Abstract

The AI Cost and Provisioning Standard (ACPS) defines a vendor-neutral format for representing, allocating, and reporting AI service costs. ACPS enables interoperability between AI providers, financial systems, and governance tools.

**Status:** Draft Standard
**Maintainer:** Finault (https://finault.ai)
**License:** Apache 2.0

---

## 1. Problem Statement

Organizations using AI services face fragmented billing data across multiple providers (OpenAI, Anthropic, Azure, AWS Bedrock, Google Vertex). Each provider uses different invoice formats, column naming conventions, and cost attribution methods. This creates overhead for finance teams performing month-end close.

## 2. ACPS Components

1. **Normalized Invoice Schema** - Common format for all AI provider invoices
2. **Allocation Rules Schema** - Standard way to define cost attribution rules
3. **Journal Entry Format** - ERP-ready output specification
4. **Reconciliation Certificate** - Cryptographically verifiable audit trail

---

## 3. Line Item Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| timestamp | datetime | Yes | ISO 8601 when usage occurred |
| provider | enum | Yes | openai, anthropic, azure, aws, google |
| model | string | Yes | Model identifier |
| input_tokens | integer | No | Input token count |
| output_tokens | integer | No | Output token count |
| cost.amount | decimal | Yes | Cost value |
| cost.currency | string | Yes | ISO 4217 currency code |
| metadata.project | string | No | Project identifier |
| metadata.environment | string | No | prod, staging, dev |

---

## 4. Allocation Rules Schema

| Field | Type | Description |
|-------|------|-------------|
| name | string | Human-readable rule name |
| priority | integer | Lower number = higher priority |
| match.type | enum | exact, prefix, contains, regex, default |
| match.field | string | Field to match (project, model, user_id) |
| match.value | string | Value to match against |
| allocate_to.cost_center | string | Target cost center code |
| allocate_to.gl_account | string | GL account code |
| allocate_to.department | string | Department name |

Rules are evaluated in priority order. First match wins.

---

## 5. Journal Entry Format

Balanced double-entry bookkeeping format:

- Sum of debits MUST equal sum of credits
- Each line has debit OR credit, not both
- Includes effective_date, entry_date, period
- Cost center and memo per line
- Reference to source (FINAULT-YYYY-MM)

## 6. Reconciliation Certificate

Cryptographically verifiable audit trail:

- **source.hash**: SHA-256 of input invoice data
- **allocation.hash**: SHA-256 of allocation output
- **journal.hash**: SHA-256 of journal entry
- **combined_hash**: SHA-256(source + allocation + journal)

Includes attestation statement and 7-year retention policy.

---

## 7. ERP Export Formats

ACPS-compliant tools MUST support:

| System | Format | Description |
|--------|--------|-------------|
| NetSuite | CSV | NetSuite Journal Import |
| QuickBooks | IIF | Intuit Interchange Format |
| Xero | CSV | Xero Invoice Import |
| Sage | CSV | Sage Journal Import |

---

## 8. Reference Implementation

**Live API:** https://finault-gateway.finault.workers.dev

| Endpoint | Description |
|----------|-------------|
| POST /v1/parse | Parse invoice to ACPS format |
| POST /v1/allocate | Apply allocation rules |
| POST /v1/analyze | Full analysis with anomaly detection |
| POST /v1/close-pack | Generate complete Close Pack |
| GET /v1/rules | List allocation rules |

---

## 9. License

Apache 2.0 - Free to use, modify, and distribute.

**Copyright 2026 Finault. Every AI dollar tagged.**
