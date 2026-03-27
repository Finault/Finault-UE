# FINAULT SPEC: Cryptographic Proof Upgrade + Intelligence Features + Open-Source Research

**Author**: Claude (strategy/spec session)  
**For**: Cowork implementation after current wiring sprint  
**Date**: March 22, 2026  
**Entity**: Finault LLC  

---

## TABLE OF CONTENTS

1. [Merkle Seal Tree — Cryptographic Proof System](#1-merkle-seal-tree)
2. [Semantic Cache Opportunity Detector](#2-semantic-cache-opportunity-detector)
3. [Routing Recommendation Engine](#3-routing-recommendation-engine)
4. [Open-Source Research Sprint Results](#4-open-source-research-sprint)

---

## 1. MERKLE SEAL TREE

### 1.1 Architecture Overview

Replace the linear SHA-256 chain with a proper append-only Merkle tree. This enables O(log n) inclusion proofs and O(log n) consistency proofs, making every AIEI receipt independently verifiable without trusting Finault.

**Design decisions informed by immudb and Trillian:**

The tree follows a two-level design. The main Merkle tree has one leaf per sealed AIEI receipt. Each leaf is `SHA-256(canonical JSON of the receipt)`. Internal nodes are `SHA-256(left_child || right_child)`. The root hash is the cryptographic commitment to every seal in the tree.

There is no linear proof fallback. immudb's hybrid approach (linear chain for peak writes, Merkle for verification) introduced a vulnerability where linear intermediate nodes weren't fully validated against the tree. Finault skips this entirely. At Finault's current scale (thousands to low millions of seals), Merkle recalculation on every batch is fast enough. immudb confirmed this in practice — the linear fallback was rarely needed.

Finault is a "personality" on the Trillian model. Trillian separates the generic Merkle log from the application-specific logic (admission criteria, canonicalization, dedup, API). For Finault: the leaf data is the AIEI receipt, the admission criteria is a valid sealed receipt with WHO/WHAT/WORTH/RULES fields, and the API is the gateway endpoints.

### 1.2 Data Model

**Table: `merkle_nodes`**

| Column | Type | Description |
|--------|------|-------------|
| `tree_id` | UUID | Identifies the tree (one per Finault org, or one global) |
| `level` | INTEGER | 0 = leaf, increases toward root |
| `index` | BIGINT | Position at this level (left-to-right) |
| `hash` | TEXT | `sha256:` prefixed hex digest |
| `created_at` | TIMESTAMPTZ | When this node was computed |

Primary key: `(tree_id, level, index)`.

**Table: `tree_heads`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `tree_id` | UUID | FK to the tree |
| `tree_size` | BIGINT | Number of leaves at this snapshot |
| `root_hash` | TEXT | `sha256:` prefixed root |
| `signature` | TEXT | `ed25519:` prefixed signature over `tree_size || root_hash || timestamp` |
| `timestamp` | TIMESTAMPTZ | When this head was signed |
| `created_at` | TIMESTAMPTZ | Row creation time |

Index on `(tree_id, tree_size)` for efficient lookup.

**Table: `seal_tree_index`**

| Column | Type | Description |
|--------|------|-------------|
| `seal_id` | UUID | FK to the seal |
| `tree_id` | UUID | FK to the tree |
| `leaf_index` | BIGINT | Position in the tree (level 0 index) |
| `leaf_hash` | TEXT | The leaf hash |

This is the deduplication table. If the same `seal_id` is submitted twice, it maps to the same `leaf_index`. This follows Trillian's identity-hash dedup pattern.

### 1.3 Tree Operations (JavaScript, Cloudflare Worker)

**Leaf insertion:**

```
function computeLeafHash(receipt) {
  // Canonical JSON: sorted keys, no whitespace, UTF-8
  const canonical = canonicalizeJSON(receipt);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return 'sha256:' + hex(hash);
}
```

**Internal node computation:**

```
function computeParentHash(leftHash, rightHash) {
  // Prefix with 0x01 to distinguish internal nodes from leaves (RFC 6962)
  const input = new Uint8Array([0x01, ...fromHex(leftHash), ...fromHex(rightHash)]);
  const hash = await crypto.subtle.digest('SHA-256', input);
  return 'sha256:' + hex(hash);
}
```

The `0x01` prefix on internal nodes (and implicitly `0x00` on leaves) prevents second-preimage attacks where an attacker crafts a leaf that looks like an internal node. This is the RFC 6962 (Certificate Transparency) convention that Trillian uses.

**Batch insertion:**

New seals accumulate in a buffer. Every 60 seconds or every 100 seals (whichever comes first), a batch is processed:

1. Compute leaf hashes for all new seals
2. Insert leaves at `level=0`, starting at `index=current_tree_size`
3. Recompute affected internal nodes up to the root
4. Sign the new root with Ed25519 private key
5. Insert new `tree_heads` row
6. Insert `seal_tree_index` mappings

Only the "right edge" of the tree needs recomputation — O(log n) nodes per batch, not the entire tree.

**Odd leaf handling:**

When the number of leaves is not a power of 2, the last leaf at any level is "promoted" — it becomes the input to the next level directly. This matches the RFC 6962 spec for incomplete trees.

### 1.4 Proof Types

**Inclusion proof — proving a seal exists in the tree:**

Given a `seal_id` and a `tree_size`, return the sibling hashes from the leaf to the root. The verifier:

1. Starts with the leaf hash
2. For each sibling hash in the proof, computes the parent: `SHA-256(0x01 || min(current, sibling) || max(current, sibling))` — order depends on whether the current node is left or right child
3. Compares the final computed root to the signed tree head's root hash
4. Verifies the tree head signature using Finault's Ed25519 public key

Proof size: O(log₂ n) hashes. For 1 million seals: ~20 hashes = ~640 bytes.

**Consistency proof — proving the tree only grew, nothing changed:**

Given `tree_size_1` (old) and `tree_size_2` (new), return the minimal set of hashes that proves the old tree is a prefix of the new tree. This is what Close Packs use: "March's tree head is consistent with April's tree head."

The algorithm follows RFC 6962 Section 2.1.2. The verifier reconstructs both roots from the proof hashes and confirms they match the respective signed tree heads.

**Endpoint: `GET /v1/proofs/inclusion`**

Query params: `seal_id` (required), `tree_size` (optional, defaults to latest)

Response:
```json
{
  "seal_id": "...",
  "leaf_index": 47293,
  "leaf_hash": "sha256:...",
  "tree_size": 847293,
  "proof": ["sha256:...", "sha256:...", ...],
  "signed_tree_head": {
    "root_hash": "sha256:...",
    "tree_size": 847293,
    "signature": "ed25519:...",
    "timestamp": "2026-03-31T23:59:59Z"
  }
}
```

**Endpoint: `GET /v1/proofs/consistency`**

Query params: `tree_size_1` (required), `tree_size_2` (required)

Response:
```json
{
  "tree_size_1": 712000,
  "tree_size_2": 847293,
  "proof": ["sha256:...", "sha256:...", ...],
  "signed_tree_head_1": { ... },
  "signed_tree_head_2": { ... }
}
```

### 1.5 Signed Tree Heads and Key Management

**Key generation (one-time setup):**

Generate an Ed25519 keypair. Store the private key in a Cloudflare Worker secret (`FINAULT_SIGNING_KEY`). The private key never leaves the Worker runtime.

**Signing:**

The signed message is the concatenation: `tree_size (8 bytes big-endian) || root_hash (32 bytes) || timestamp (ISO 8601 UTF-8 bytes)`.

**Public key publication:**

Two locations:
1. `https://finault.ai/.well-known/finault-verification-key` — returns the Ed25519 public key in base64
2. `github.com/Finault/aiei-spec/VERIFICATION.md` — documents the key and verification procedure

Anyone with the public key and a proof response can verify any seal independently. No Finault API access required after obtaining the proof data.

### 1.6 AIEI PROOF Field Upgrade

Current format:
```json
{
  "hash": "sha256:...",
  "prev_hash": "sha256:...",
  "chain_depth": 4729,
  "algorithm": "SHA-256"
}
```

New format:
```json
{
  "version": 2,
  "leaf_hash": "sha256:...",
  "tree_size": 847293,
  "tree_root": "sha256:...",
  "inclusion_proof": ["sha256:...", "sha256:..."],
  "signed_tree_head": {
    "root": "sha256:...",
    "size": 847293,
    "signature": "ed25519:...",
    "timestamp": "2026-03-31T23:59:59Z"
  },
  "verify_url": "https://finault.ai/v1/proofs/inclusion?seal_id=...",
  "public_key_url": "https://finault.ai/.well-known/finault-verification-key"
}
```

The `version: 2` field enables backward compatibility. Old seals with `version: 1` (implicit) use the linear chain. New seals use the Merkle tree. The transition is non-breaking.

### 1.7 Client-Side Verification in the Receipt Page

The `/r/[seal_id]` page gets a "Verify this seal" button. On click:

1. Fetch the inclusion proof from `/v1/proofs/inclusion?seal_id={id}`
2. Fetch the public key from `/.well-known/finault-verification-key`
3. In the browser, using Web Crypto API (`SubtleCrypto.digest` for SHA-256, `SubtleCrypto.verify` for Ed25519):
   - Recompute the leaf hash from the receipt data displayed on the page
   - Walk the proof path, computing each parent hash
   - Verify the computed root matches the signed tree head's root
   - Verify the Ed25519 signature on the tree head
4. Display result: "✓ Cryptographically verified — this seal is provably included in Finault's Merkle tree at position {leaf_index} of {tree_size} total seals."
5. Collapsible details showing the proof path and verification steps

No server trust required. The math proves it.

### 1.8 Close Pack Upgrade

Each monthly Close Pack now includes:

- `signed_tree_head`: The tree head at month-end
- `consistency_proof`: Proof that last month's tree head is a prefix of this month's tree head
- `seal_count`: Number of seals added this month
- `cumulative_seal_count`: Total seals in the tree

This creates an auditable chain: anyone with the sequence of monthly Close Packs can verify that the tree only ever grew, nothing was deleted or modified. The consistency proofs are the cryptographic guarantee.

### 1.9 Implementation Order for Cowork

1. Create Supabase tables (`merkle_nodes`, `tree_heads`, `seal_tree_index`)
2. Implement `computeLeafHash`, `computeParentHash` in gateway
3. Implement batch insertion with Durable Object (accumulate seals, flush on timer/threshold)
4. Implement inclusion proof generation
5. Implement consistency proof generation
6. Generate Ed25519 keypair, store private in Worker secret, publish public
7. Add proof endpoints to gateway
8. Update AIEI PROOF field in seal creation
9. Add client-side verification to `/r/[seal_id]`
10. Update Close Pack generation to include tree heads and consistency proofs

### 1.10 What NOT to Build

- **No tile-based storage.** Trillian uses tiles for caching efficiency at massive scale. At Finault's current scale, individual node storage is fine. Revisit at 10M+ seals.
- **No linear proof fallback.** immudb's hybrid caused a vulnerability. Pure Merkle only.
- **No external dependency on immudb or Trillian.** Study their architecture, build Finault's own ~500-line JavaScript implementation.
- **No separate internal transaction trees.** immudb has a per-transaction Merkle tree for multi-entry transactions. Finault seals are atomic — one receipt = one leaf. Keep it simple.

---

## 2. SEMANTIC CACHE OPPORTUNITY DETECTOR

### 2.1 Purpose

Not a cache. A detector. Analyzes query patterns across a customer's AI usage and reports how much money they could save by implementing semantic caching. This is an Intelligence Report feature, not a runtime system.

### 2.2 Architecture

**Data capture (gateway/SDK):**

On every AI API call, the gateway captures:
- `query_hash`: SHA-256 of the user message (full text not stored by default for privacy)
- `query_text`: Full text (only if customer opts in via `capture_query_text: true` in org settings)
- `model`: Which model was called
- `cost`: Computed cost of this call
- `timestamp`: When the call happened
- `org_id`, `customer_id`: Attribution

Store in `query_log` table. Retention: 90 days rolling.

**Analysis job (nightly):**

For each org, for each customer with >100 queries in the last 30 days:

1. Pull the last 1,000–10,000 queries (configurable)
2. If `query_text` is available: compute embeddings using a lightweight model (all-MiniLM-L6-v2 via Cloudflare Workers AI, or a hosted embedding endpoint)
3. If only `query_hash` available: use exact-match deduplication (still valuable, just less powerful)
4. Cluster embeddings using cosine similarity with configurable threshold (default 0.92)
5. Compute metrics:
   - `total_queries`: Total in analysis window
   - `unique_queries`: Number of distinct clusters
   - `duplicate_clusters`: Number of clusters with >1 member
   - `estimated_cache_hit_rate`: `(total_queries - unique_queries) / total_queries`
   - `estimated_savings_usd`: Sum of cost for all non-first-occurrence queries in each cluster
   - `top_duplicated_queries`: The 10 most frequently repeated query patterns (anonymized if text not captured)

**Patterns learned from GPTCache:**

GPTCache's modular architecture separates embedding, similarity evaluation, storage, and eviction. Finault doesn't need to implement a cache — but the analysis pipeline mirrors GPTCache's evaluation flow: embed → compare → score. Key insight from GPTCache: they found that cosine similarity alone produces false positives. They added an ONNX-based verification step. For Finault's detector (not a runtime cache), false positives in the analysis are acceptable with a disclaimer — we're estimating savings, not guaranteeing them.

GPTCache also tracks three quality metrics: hit ratio, latency improvement, and recall. Finault should surface all three as projections in the Intelligence Report.

**What Upstash Semantic Cache teaches:**

Upstash's implementation is a lightweight JS library using vector similarity. The key pattern: it stores embeddings in a vector database and checks new queries against existing entries before calling the LLM. For Finault's detector, the pattern is reversed: we analyze historical queries after the fact to find what could have been cached.

### 2.3 Data Model

**Table: `cache_analysis`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `org_id` | UUID | FK to organization |
| `customer_id` | UUID | FK to customer (nullable for org-wide) |
| `analysis_date` | DATE | When this analysis ran |
| `window_days` | INTEGER | How many days of data analyzed |
| `total_queries` | INTEGER | Total queries in window |
| `unique_queries` | INTEGER | Distinct query clusters |
| `estimated_cache_rate` | DECIMAL(5,4) | 0.0000 to 1.0000 |
| `estimated_savings_usd` | DECIMAL(10,2) | Projected monthly savings |
| `top_clusters` | JSONB | Top 10 duplicate clusters with count and sample |
| `created_at` | TIMESTAMPTZ | Row creation |

### 2.4 Customer-Facing Output

In the Intelligence Report and Recommendations panel:

> **Cache Opportunity Detected**
>
> Customer Acme Corp sent 4,231 queries this month. 67% were semantically similar to a previous query. Estimated savings with semantic caching: **$1,423/month**.
>
> Top repeated patterns:
> 1. "Summarize this document" variants — 847 occurrences, ~$312 savings
> 2. "Extract key points from..." variants — 623 occurrences, ~$229 savings
> 3. Classification queries — 412 occurrences, ~$151 savings
>
> *Savings estimates based on cosine similarity threshold of 0.92. Actual results depend on cache implementation and acceptable answer variation.*

### 2.5 Implementation Order

1. Add `query_hash` capture to gateway (always on, low overhead)
2. Add optional `query_text` capture behind org setting
3. Create `cache_analysis` table
4. Build nightly analysis job (start with exact-match on `query_hash`)
5. Add embedding-based clustering when Cloudflare Workers AI embedding is available
6. Surface results in Intelligence Report

---

## 3. ROUTING RECOMMENDATION ENGINE

### 3.1 Purpose

Not a router. An analyzer. Looks at actual usage patterns and recommends model substitutions that would save money without reducing quality. This is Finault connecting cost to revenue — showing not just "you could save $X" but "your margin on Customer Y would go from 12% to 41%."

### 3.2 Architecture

**Data capture (gateway/SDK):**

On every AI API call, the gateway already captures:
- `model`: Which model was used
- `input_tokens`, `output_tokens`: Token counts
- `cost`: Computed cost
- `org_id`, `customer_id`: Attribution

Additional capture needed:
- `system_prompt_tokens`: Length of system prompt (complexity signal)
- `tool_count`: Number of tools provided (complexity signal)
- `response_quality_proxy`: If the response was used (not retried), it was "good enough" — this is implicit quality signal

Store in existing `api_calls` table.

**Complexity scoring:**

Compute a complexity score per call. This is a simple heuristic, not an ML model:

```
complexity_score = (
  0.3 * normalize(input_tokens, 0, 128000) +
  0.2 * normalize(output_tokens, 0, 16000) +
  0.2 * normalize(system_prompt_tokens, 0, 10000) +
  0.15 * normalize(tool_count, 0, 20) +
  0.15 * (1 if has_images else 0)
)
```

Score range: 0.0 (trivially simple) to 1.0 (maximally complex).

**Patterns learned from NadirClaw:**

NadirClaw uses a sentence-embedding classifier with pre-computed centroids to classify prompts as "simple" or "complex" in ~10ms. It ships two centroid vectors (~1.5 KB each) derived from ~170 seed prompts, then computes cosine similarity to both centroids for each incoming prompt. The key insight: binary classification (simple/complex) works well enough for routing, and the classification overhead is negligible.

For Finault's recommendation engine, we don't need real-time classification — we analyze historical data. But NadirClaw's approach informs the complexity scoring: prompt embedding distance from a "simple" centroid is a good complexity proxy. Finault could use this as a more sophisticated alternative to the token-count heuristic above, once embedding infrastructure is in place.

NadirClaw reports 40-70% cost savings depending on workload, with 60-70% of typical coding prompts being "simple." This is a useful benchmark for Finault's recommendations.

**Pricing intelligence from LiteLLM:**

LiteLLM maintains a comprehensive model pricing database at `model_prices_and_context_window.json` — covering 100+ models with input/output cost per token, context windows, and capabilities. Finault should ingest this data (it's MIT-licensed JSON) to power model substitution recommendations.

The pricing data includes per-provider pricing, cached token rates, audio/image token rates, and reasoning token rates. This is the most complete open-source pricing database available.

**Analysis job (nightly):**

For each org, for each customer:

1. Pull all API calls from the last 30 days
2. Group by model
3. For each model, compute average complexity score
4. Flag calls where: (a) the model is in the top pricing tier, AND (b) the complexity score is below the median for that model's tier
5. For each flagged group, find the cheapest model that supports the same capabilities (text, images, tools) using LiteLLM's pricing data
6. Compute savings: `(current_cost - recommended_cost) × qualifying_call_count`
7. Compute margin impact: recalculate the customer's margin with the recommended model mix

### 3.3 Data Model

**Table: `routing_recommendations`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `org_id` | UUID | FK to organization |
| `customer_id` | UUID | FK to customer |
| `analysis_date` | DATE | When this ran |
| `current_model` | TEXT | e.g., "gpt-4o" |
| `recommended_model` | TEXT | e.g., "gpt-4o-mini" |
| `qualifying_calls` | INTEGER | Calls that could be rerouted |
| `current_monthly_cost` | DECIMAL(10,2) | Cost at current model |
| `recommended_monthly_cost` | DECIMAL(10,2) | Cost at recommended model |
| `savings_usd` | DECIMAL(10,2) | Difference |
| `current_margin_pct` | DECIMAL(5,2) | Customer margin before |
| `projected_margin_pct` | DECIMAL(5,2) | Customer margin after |
| `avg_complexity_score` | DECIMAL(5,4) | Average complexity of qualifying calls |
| `confidence` | TEXT | 'high', 'medium', 'low' |
| `created_at` | TIMESTAMPTZ | Row creation |

### 3.4 Customer-Facing Output

In the Intelligence Report:

> **Model Optimization Opportunity**
>
> 3,400 GPT-4o classification calls for Customer Acme Corp could run on GPT-4o-mini.
>
> - Current cost: $289/month
> - Recommended cost: $24/month  
> - **Savings: $265/month**
> - Margin impact: **12% → 41%**
>
> These calls had an average complexity score of 0.18 (below the 0.35 threshold for model downgrade). No tool usage, no images, average 340 input tokens.
>
> *Recommendation confidence: HIGH. Based on 30-day analysis of 3,400 qualifying calls.*

This is the killer feature. Nobody else shows the margin impact of model routing decisions. This is WORTH field value.

### 3.5 LiteLLM Pricing Data Integration

Maintain a `model_pricing` table synced from LiteLLM's JSON:

| Column | Type | Description |
|--------|------|-------------|
| `model_id` | TEXT | e.g., "gpt-4o" |
| `provider` | TEXT | e.g., "openai" |
| `input_cost_per_token` | DECIMAL(15,12) | |
| `output_cost_per_token` | DECIMAL(15,12) | |
| `max_input_tokens` | INTEGER | |
| `max_output_tokens` | INTEGER | |
| `supports_vision` | BOOLEAN | |
| `supports_tools` | BOOLEAN | |
| `supports_streaming` | BOOLEAN | |
| `last_synced` | TIMESTAMPTZ | |

Sync daily from the LiteLLM GitHub JSON file. This gives Finault a live, accurate pricing database for 100+ models across all major providers.

### 3.6 Implementation Order

1. Add complexity scoring fields to `api_calls` table
2. Compute complexity score on every gateway call (cheap arithmetic)
3. Create `model_pricing` table, build sync job from LiteLLM JSON
4. Create `routing_recommendations` table
5. Build nightly analysis job
6. Surface in Intelligence Report with margin impact

---

## 4. OPEN-SOURCE RESEARCH SPRINT

### 4.1 Financial Reporting Standards for AI

**Finding: No open-source implementation exists for AI cost allocation to GL journal entries.**

The space is entirely occupied by commercial tools. Rillet (AI-native ERP connecting Stripe/Salesforce to automated journal entries), Trullion (ASC 606/IFRS 15 revenue recognition with journal entry generation), and DualEntry (AI-assisted GL with automated allocations) are all closed-source SaaS.

The academic paper "Practical Principles for AI Cost and Compute Accounting" (arXiv:2502.15873) proposes seven principles for AI cost accounting standards, including parallels to financial accounting's "fair value" estimations. Key relevant principle: developers should produce auditable, itemized accounting reports — which is what Finault's Intelligence Report already does.

**What Finault should build:** A GL journal entry generator that takes a monthly Close Pack and produces standard double-entry accounting entries for AI costs. Output format: CSV compatible with QuickBooks, Xero, and Sage import. This would be the first open-source tool connecting AI operational costs to financial reporting entries. Publish it as part of the AIEI spec.

**FinRobot** (github.com/AI4Finance-Foundation/FinRobot, ~2K stars, MIT license) is an AI agent platform for financial analysis — equity research, market forecasting, document analysis. Not directly relevant to AI cost accounting, but its report generation pipeline (multi-page HTML/PDF with 15+ chart types) is a pattern worth studying for Finault's Intelligence Report rendering.

### 4.2 Anomaly Detection for Time-Series Cost Data

**Best fit: PyOD + lightweight custom rules.**

The landscape is mature:

- **PyOD** (github.com/yzhao062/pyod, ~8.5K stars, BSD-2): Comprehensive Python toolkit with 20+ algorithms including Isolation Forest, LOF, and deep learning approaches. The most cited and maintained package. Good for detecting unusual patterns in spend data.
- **ADTK** (github.com/arundo/adtk, ~1.1K stars, MPL-2.0): Rule-based/unsupervised time series anomaly detection. Practical, composable detectors — threshold, quantile, volatility, seasonal, level shift. The composable pipeline model (detector → transformer → aggregator) maps well to Finault's needs.
- **dtaianomaly** (github.com/ML-KULeuven/dtaianomaly, newer, MIT): Scikit-learn-compatible API for time-series anomaly detection. Strong on benchmarking and extensibility. Good if Finault wants to evaluate multiple algorithms systematically.
- **Luminaire** (github.com/zillow/luminaire): ML-driven anomaly detection and forecasting for time series. Built by Zillow for monitoring thousands of metrics.

**What Finault should build:** A "Cost Anomaly Detector" that runs nightly per customer:

1. Compute daily AI spend for the last 90 days
2. Apply seasonal decomposition (most AI usage has weekly patterns)
3. Flag days where spend exceeds 2σ from the trend-adjusted mean
4. Classify anomalies: spike (single day), drift (gradual increase), cliff (sudden drop)
5. Surface in the Intelligence Report with natural language: "Customer Acme Corp's AI spend spiked 340% on March 15. Root cause: 12,847 GPT-4o calls from a new agent deployment."

Implementation: don't import PyOD as a dependency. Study the Isolation Forest and seasonal decomposition patterns. Implement a lightweight version in JavaScript for the Worker, or run as a Python job on Supabase Edge Functions.

### 4.3 Contract/Pricing Intelligence

**Finding: No open-source tool exists for AI pricing optimization.**

Commercial tools like Pricefx, Zilliant, and PROS handle pricing intelligence but are all enterprise SaaS for traditional industries (manufacturing, distribution). None address AI-specific pricing.

**What Finault should build:** The Finault Index — cross-customer anonymized benchmarks:

- "The median cost per AI transaction in your industry segment is $0.043. Your average is $0.067."
- "Companies in your revenue band spend 3.2% of AI revenue on compute. You spend 5.1%."
- "87% of companies with your usage pattern use GPT-4o-mini for classification. You use GPT-4o."

This is the network effect play. Each customer's data (anonymized) makes the Index more valuable for everyone. No open-source competitor exists because nobody else has the per-customer revenue + cost data to build it.

### 4.4 Compliance Documentation Generators

**Best fits:**

- **Systima Comply** (github.com/systima-ai/comply, MIT): CLI tool that scans codebases for EU AI Act compliance risks. AST-based detection across 37+ AI frameworks, domain-adjusted severity. Runs in CI, posts findings on PRs. Relevant pattern: automated compliance scanning from code/logs. ~8 second scan on a 20K-star repo.
- **TechOps Templates** (arXiv:2508.08804): Open-source templates for documenting data, models, and applications per AI Act Annex IV requirements. Covers the full AI lifecycle. Published August 2025.
- **BinaryVerseAI EU AI Act Templates** (github.com/BinaryVerseAI/eu-ai-act-compliance-templates): Starter YAML/Terraform templates mapping to Articles 10, 11, 12 of the AI Act. Basic but a useful starting point.
- **AuditDraft** (audit.omensystems.com): SaaS tool that generates Annex IV model cards and tracks Articles 8-15 compliance. Not open source, but shows what the market wants.

**What Finault should build:** A "Compliance Report Generator" that takes a customer's seal history and automatically produces:

1. **EU AI Act Article 12 record-keeping documentation**: Automatically generated from sealed receipts — every AI transaction logged with timestamp, model, cost, and sealed proof
2. **Colorado SB205 disclosure documentation**: AI usage disclosure reports showing what AI systems are in use, what decisions they inform, and cost/performance data
3. **SOC 2 AI controls evidence**: The Merkle seal tree IS the evidence. Tamper-evident logs with cryptographic proofs. Export as an auditor-ready PDF.

Target: auto-generate 80% of the documentation from data Finault already collects. Enforcement deadlines: EU AI Act Aug 2026, Colorado SB205 Jun 2026.

### 4.5 Agent Dependency Mapping

**Best fits for studying patterns (not dependencies):**

- **Langfuse** (github.com/langfuse/langfuse, ~8K stars, MIT): Open-source LLM observability. Captures traces with parent-child relationships between agent steps, token usage, cost per step. The trace data model (spans with nested tool calls) is the pattern Finault needs.
- **OpenTelemetry GenAI Semantic Conventions**: The industry is converging on OTEL for agent telemetry. Semantic conventions for tasks, actions, agents, teams, artifacts, and memory are in active development. Finault should align its trace format with OTEL GenAI conventions.
- **AgentPrism** (github.com/nicepkg/agent-prism, MIT): React component library for visualizing agent traces. Tree views, sequence diagrams, timeline views. Pattern to study for Finault's agent dependency visualization.
- **LangSmith**: LangChain's observability platform. Auto-instruments chains, agents, and tool calls. The trace visualization (step-by-step with cost per step) is the gold standard for UX.

**What Finault should build:** An "Agent Dependency Map" that:

1. Traces which agents call which other agents (from gateway logs)
2. Computes cost per agent in a multi-agent chain
3. Identifies cascade risk: "If Agent A's API key is revoked, Agents B, C, and D also stop working"
4. Computes "blast radius" in dollars: "Agent A failure costs $4,200/day across 3 downstream agents"

The trace format should follow OpenTelemetry GenAI conventions so customers can export to their existing observability stack (Datadog, New Relic, Grafana).

### 4.6 Webhook/Event Systems

**Best fit: Svix pattern, custom implementation.**

- **Svix** (github.com/svix/svix-webhooks, ~3.1K stars, MIT): Enterprise-grade webhook delivery service written in Rust. Key patterns: signed messages (Ed25519 + HMAC), automatic retries with exponential backoff, event type filtering, per-endpoint secrets. Used by Brex, Resend, and others. The signing approach aligns perfectly with Finault's Ed25519 key infrastructure (same key used for Merkle tree signing can sign webhook payloads).

**What Finault should build:** A lightweight webhook/notification system in the gateway:

Event types:
- `seal.created` — New seal generated
- `cost.anomaly` — Spend anomaly detected
- `margin.threshold` — Customer margin dropped below threshold
- `closePack.generated` — Monthly Close Pack ready
- `recommendation.new` — New optimization recommendation

Delivery targets:
- Slack (incoming webhook URL)
- Discord (webhook URL)
- Microsoft Teams (incoming webhook)
- Custom HTTP endpoint (with HMAC signing)

Implementation: don't import Svix as a dependency. Build a simple webhook dispatcher in the gateway Worker. Store webhook configs in `org_webhooks` table. On event, POST to all registered endpoints for that org with signed payload. Retry 3 times with exponential backoff (1s, 10s, 100s). Log delivery status.

The key Svix pattern to copy: symmetric HMAC signing per endpoint (each webhook endpoint gets its own secret), with the signed payload including a timestamp to prevent replay attacks.

### 4.7 Cost-to-Revenue Gap — Competitive Landscape

**Finding: Nobody is building in this space yet.**

Extensive searching confirms the handoff document's assertion: no open-source project connects AI cost data to revenue data. The entire observability ecosystem (Helicone, Langfuse, Braintrust, Datadog LLM) tracks costs only. The payment/billing layer (Paid.ai, Skyfire, Nevermined) handles transactions only. The gap between "what did this AI call cost?" and "what revenue did it generate?" remains unfilled.

The closest adjacent pattern is FinOps for cloud (OpenCost, Kubecost) — these connect infrastructure costs to teams/services but not to revenue. The Finault WORTH field (cost + revenue = margin) remains a unique and defensible position.

**One emerging signal:** LiteLLM added "Provider Margins" and "Provider Discounts" features in their pricing calculator — the ability to add markups/fees on top of LLM costs. This is the first sign that the gateway layer is starting to think about revenue, not just cost. But it's a static configuration, not dynamic per-customer margin tracking. Finault's approach (sealed per-customer margins with cryptographic proof) is fundamentally different and more valuable.

---

## SUMMARY: WHAT COWORK SHOULD BUILD, IN ORDER

### Phase A: Foundation (immediately after current wiring sprint)

1. Merkle tree tables + core hash functions
2. Batch seal insertion with tree update
3. Ed25519 key generation + publication
4. Inclusion proof endpoint
5. Client-side verification on receipt page

### Phase B: Intelligence Features (weeks 2-4)

6. Complexity scoring on every gateway call
7. LiteLLM pricing data sync
8. Routing recommendation nightly job
9. Cache opportunity analysis (exact-match first, embeddings later)
10. Cost anomaly detection (lightweight, rule-based)

### Phase C: Reporting + Notifications (weeks 4-6)

11. Intelligence Report integration (cache + routing + anomaly findings)
12. Consistency proof endpoint + Close Pack upgrade
13. Webhook notification system
14. Compliance report generator (EU AI Act, Colorado SB205)

### Phase D: Network (weeks 6-8)

15. Agent dependency mapping from gateway traces
16. GL journal entry export
17. Finault Index benchmarks (requires multiple customers)

---

*This document is a spec for Cowork. It describes what to build and why. Implementation details (exact function signatures, error handling, test cases) are Cowork's domain.*
