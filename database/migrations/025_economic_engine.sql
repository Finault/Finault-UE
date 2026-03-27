-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 025: Economic Engine — Transactions, Outcomes, and Pricing
-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase 2 infrastructure: Every AI transaction that flows through finault.complete()
-- or finault.outcome() is logged here with full economic context.
--
-- Three systems:
--   1. economic_transactions — Per-request log with routing decisions + economics
--   2. outcome_* tables — Outcome-based pricing, execution, and quality tracking
--   3. quality_feedback — Signals that train the quality model over time
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── Economic Transactions ─────────────────────────────────────────────────────
-- One row per API call through /v1/complete. The economic audit trail.
-- Indexed for fast aggregation by customer, feature, and time.

CREATE TABLE IF NOT EXISTS economic_transactions (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id          TEXT NOT NULL UNIQUE,
    org_id              UUID REFERENCES organizations(id),
    customer_id         TEXT,                        -- The end-customer this request served
    feature             TEXT,                        -- Feature that triggered the request
    team                TEXT,                        -- Team/department responsible
    model               TEXT NOT NULL,               -- Model that was actually used
    original_model      TEXT,                        -- Model originally requested (if different)
    provider            TEXT NOT NULL,               -- Provider that served the request
    input_tokens        INTEGER DEFAULT 0,
    output_tokens       INTEGER DEFAULT 0,
    cost                NUMERIC(12, 8) NOT NULL,     -- Actual cost in USD
    savings             NUMERIC(12, 8) DEFAULT 0,    -- Savings vs. original model
    routing_reason      TEXT,                        -- Why this model was selected
    task_type           TEXT,                        -- Classified task type
    margin_impact       JSONB,                       -- { current, projected, delta }
    budget_status       JSONB,                       -- { remaining, utilization, enforcement }
    decision_time_us    INTEGER,                     -- Microseconds for routing decision
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_econ_tx_org_time
    ON economic_transactions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_econ_tx_customer
    ON economic_transactions(org_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_econ_tx_feature
    ON economic_transactions(org_id, feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_econ_tx_model
    ON economic_transactions(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_econ_tx_routing
    ON economic_transactions(routing_reason) WHERE routing_reason != 'direct';


-- ─── Outcome Catalog ───────────────────────────────────────────────────────────
-- Registry of defined outcome types with fixed pricing.
-- Each outcome has a base price, quality criteria, and orchestration config.

CREATE TABLE IF NOT EXISTS outcome_catalog (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id              UUID REFERENCES organizations(id),
    task_type           TEXT NOT NULL,                -- e.g., 'review_contract', 'debug_function', 'generate_email'
    display_name        TEXT NOT NULL,
    description         TEXT,

    -- Pricing
    base_price          NUMERIC(10, 4) NOT NULL,     -- Fixed price in USD
    min_price           NUMERIC(10, 4),              -- Floor for dynamic pricing
    max_price           NUMERIC(10, 4),              -- Ceiling for dynamic pricing
    pricing_model       TEXT DEFAULT 'fixed',         -- 'fixed', 'dynamic', 'budget_capped'

    -- Quality requirements
    quality_threshold   NUMERIC(5, 2) DEFAULT 0.85,  -- Min quality score to accept (0-1)
    max_retries         INTEGER DEFAULT 3,           -- Max retry attempts
    timeout_seconds     INTEGER DEFAULT 120,         -- Max execution time

    -- Orchestration config
    preferred_models    TEXT[] DEFAULT '{}',          -- Ordered model preference
    fallback_models     TEXT[] DEFAULT '{}',          -- Fallback if preferred fails
    system_prompt       TEXT,                         -- Optimized system prompt for this outcome
    orchestration       JSONB DEFAULT '{}',           -- { strategy: 'single'|'chain'|'parallel'|'escalate' }

    -- Economics
    avg_token_cost      NUMERIC(10, 6),              -- Running average actual token cost
    avg_tokens_used     INTEGER,                     -- Running average total tokens
    margin              NUMERIC(5, 4),               -- Current margin (price - avg_cost) / price
    executions_count    INTEGER DEFAULT 0,           -- Total times executed
    success_rate        NUMERIC(5, 4) DEFAULT 1.0,   -- Proportion that met quality bar

    -- Metadata
    is_global           BOOLEAN DEFAULT FALSE,       -- TRUE = available to all orgs (Finault-defined)
    enabled             BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_outcome_catalog_global
    ON outcome_catalog(task_type) WHERE is_global = TRUE;
CREATE INDEX IF NOT EXISTS idx_outcome_catalog_org
    ON outcome_catalog(org_id) WHERE org_id IS NOT NULL;


-- ─── Outcome Executions ────────────────────────────────────────────────────────
-- One row per outcome request. Tracks the full lifecycle from request to delivery.
-- Links to the underlying economic_transactions for each attempt.

CREATE TABLE IF NOT EXISTS outcome_executions (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id              UUID REFERENCES organizations(id),
    customer_id         TEXT,
    outcome_id          UUID REFERENCES outcome_catalog(id),
    task_type           TEXT NOT NULL,

    -- Input
    input_hash          TEXT,                        -- SHA-256 of input for deduplication
    input_size_bytes    INTEGER,
    budget              NUMERIC(10, 4),              -- Max budget customer set

    -- Pricing
    quoted_price        NUMERIC(10, 4) NOT NULL,     -- Price quoted to customer
    actual_cost         NUMERIC(10, 6) DEFAULT 0,    -- Total token cost across all attempts
    margin              NUMERIC(10, 6) DEFAULT 0,    -- quoted_price - actual_cost

    -- Execution
    status              TEXT DEFAULT 'pending',       -- pending, running, succeeded, failed, timeout, cancelled
    attempts            INTEGER DEFAULT 0,
    total_tokens        INTEGER DEFAULT 0,
    total_latency_ms    INTEGER DEFAULT 0,
    models_used         TEXT[] DEFAULT '{}',          -- All models tried across attempts

    -- Quality
    quality_score       NUMERIC(5, 4),               -- Assessed quality of final output (0-1)
    quality_method      TEXT,                         -- How quality was assessed
    met_quality_bar     BOOLEAN,                     -- Did it meet the threshold?

    -- Result
    result_summary      TEXT,                        -- Brief summary of what was produced
    error_message       TEXT,                        -- If failed, why

    -- Linked transactions
    transaction_ids     UUID[] DEFAULT '{}',          -- economic_transactions.id for each attempt

    -- Metadata
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT now(),
    completed_at        TIMESTAMPTZ,

    -- Performance index
    duration_ms         INTEGER GENERATED ALWAYS AS (
        CASE WHEN completed_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000
             ELSE NULL
        END
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_outcome_exec_org_time
    ON outcome_executions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_exec_customer
    ON outcome_executions(org_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_exec_status
    ON outcome_executions(status) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_outcome_exec_task
    ON outcome_executions(task_type, created_at DESC);


-- ─── Quality Feedback ──────────────────────────────────────────────────────────
-- User/automated signals that train the quality model over time.
-- Every signal adjusts the quality scores in the EconomicRouter.

CREATE TABLE IF NOT EXISTS quality_feedback (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id              UUID REFERENCES organizations(id),
    transaction_id      UUID REFERENCES economic_transactions(id),
    execution_id        UUID REFERENCES outcome_executions(id),

    -- The signal
    signal              TEXT NOT NULL,                -- 'thumbs_up', 'thumbs_down', 'retry', 'accepted', 'rejected', 'auto_quality'
    score               NUMERIC(5, 4),               -- Numeric score if available (0-1)
    model               TEXT NOT NULL,               -- Model that produced the output
    task_type           TEXT,                        -- Task classification

    -- Context
    input_tokens        INTEGER,
    output_tokens       INTEGER,
    was_downgraded      BOOLEAN DEFAULT FALSE,       -- Was this a downgraded model?
    original_model      TEXT,                        -- What was originally requested?

    -- Metadata
    source              TEXT DEFAULT 'user',          -- 'user', 'auto', 'api', 'quality_check'
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_feedback_model_task
    ON quality_feedback(model, task_type);
CREATE INDEX IF NOT EXISTS idx_quality_feedback_signal
    ON quality_feedback(signal, created_at DESC);


-- ─── Outcome Pricing History ───────────────────────────────────────────────────
-- Tracks how outcome prices evolve as the system learns.
-- Used for the Finault Index and for margin analysis in Close Packs.

CREATE TABLE IF NOT EXISTS outcome_pricing_history (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    outcome_id          UUID REFERENCES outcome_catalog(id),
    task_type           TEXT NOT NULL,

    -- Price point
    price               NUMERIC(10, 4) NOT NULL,
    avg_cost            NUMERIC(10, 6) NOT NULL,     -- Average actual cost at this price point
    margin              NUMERIC(5, 4) NOT NULL,
    sample_size         INTEGER NOT NULL,            -- Executions used to compute this

    -- Distribution
    cost_p50            NUMERIC(10, 6),              -- Median cost
    cost_p90            NUMERIC(10, 6),              -- 90th percentile
    cost_p99            NUMERIC(10, 6),              -- 99th percentile
    cost_stddev         NUMERIC(10, 6),              -- Standard deviation

    -- Quality at this price
    success_rate        NUMERIC(5, 4),
    avg_quality_score   NUMERIC(5, 4),

    recorded_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_pricing_task
    ON outcome_pricing_history(task_type, recorded_at DESC);


-- ─── Customer Budget Tracking ──────────────────────────────────────────────────
-- Persistent budget state (the in-memory cache in Workers is per-isolate).
-- Synced periodically from the gateway.

CREATE TABLE IF NOT EXISTS customer_budgets (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id              UUID NOT NULL REFERENCES organizations(id),
    scope               TEXT NOT NULL,                -- 'customer:xxx', 'team:xxx', 'org:xxx', 'feature:xxx'
    budget_limit        NUMERIC(12, 4) NOT NULL,
    spent               NUMERIC(12, 6) DEFAULT 0,
    period              TEXT DEFAULT 'monthly',       -- 'daily', 'weekly', 'monthly', 'quarterly'
    period_start        TIMESTAMPTZ NOT NULL,
    enabled             BOOLEAN DEFAULT TRUE,

    -- Enforcement config
    soft_threshold      NUMERIC(3, 2) DEFAULT 0.80,
    warn_threshold      NUMERIC(3, 2) DEFAULT 0.90,
    throttle_threshold  NUMERIC(3, 2) DEFAULT 0.95,
    cap_action          TEXT DEFAULT 'block',         -- 'block', 'downgrade_only', 'notify_only'

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_customer_budgets_org
    ON customer_budgets(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_budgets_scope
    ON customer_budgets(scope);


-- ─── Seed Global Outcome Catalog ───────────────────────────────────────────────
-- Finault-defined outcome types available to all orgs.

INSERT INTO outcome_catalog (org_id, task_type, display_name, description, base_price, quality_threshold, max_retries, preferred_models, orchestration, is_global)
VALUES
    (NULL, 'review_contract',     'Contract Review',          'Review a legal contract for risks, obligations, and key terms',                    2.50,  0.90, 3, ARRAY['claude-opus-4', 'gpt-4.1', 'gemini-2.5-pro'],                '{"strategy": "escalate", "start_tier": "balanced"}'),
    (NULL, 'debug_function',      'Debug Code',               'Find and fix bugs in a code function or module',                                   1.00,  0.85, 3, ARRAY['claude-sonnet-4.5', 'gpt-4.1', 'gpt-4o'],                    '{"strategy": "escalate", "start_tier": "efficient"}'),
    (NULL, 'generate_email',      'Marketing Email',          'Generate a marketing email optimized for conversion',                               0.50,  0.80, 2, ARRAY['claude-sonnet-4', 'gpt-4o', 'gemini-2.5-flash'],              '{"strategy": "single"}'),
    (NULL, 'summarize_document',  'Document Summary',         'Produce a comprehensive summary of a long document',                                0.75,  0.85, 2, ARRAY['gemini-2.5-pro', 'claude-sonnet-4.5', 'gpt-4.1'],             '{"strategy": "single"}'),
    (NULL, 'extract_data',        'Data Extraction',          'Extract structured data from unstructured text',                                    0.30,  0.90, 2, ARRAY['gpt-4.1-mini', 'claude-haiku-4.5', 'gemini-2.5-flash'],       '{"strategy": "single"}'),
    (NULL, 'classify_text',       'Text Classification',      'Classify text into predefined categories with confidence scores',                   0.10,  0.92, 2, ARRAY['gpt-4.1-nano', 'gemini-2.0-flash', 'claude-3-haiku'],          '{"strategy": "single"}'),
    (NULL, 'code_review',         'Code Review',              'Review code for quality, security, performance, and best practices',                1.50,  0.85, 3, ARRAY['claude-sonnet-4.5', 'gpt-4.1', 'o4-mini'],                    '{"strategy": "escalate", "start_tier": "balanced"}'),
    (NULL, 'translate_text',      'Text Translation',         'Translate text between languages with natural fluency',                             0.40,  0.88, 2, ARRAY['gpt-4o', 'claude-sonnet-4', 'gemini-2.5-flash'],              '{"strategy": "single"}'),
    (NULL, 'analyze_data',        'Data Analysis',            'Analyze a dataset and produce insights with visualizations',                        2.00,  0.85, 3, ARRAY['claude-opus-4', 'o3', 'gemini-2.5-pro'],                      '{"strategy": "escalate", "start_tier": "flagship"}'),
    (NULL, 'write_documentation', 'Technical Documentation',  'Write clear technical documentation from code or specs',                            1.25,  0.85, 2, ARRAY['claude-sonnet-4.5', 'gpt-4.1', 'gemini-2.5-pro'],             '{"strategy": "single"}'),
    (NULL, 'generate_tests',      'Test Generation',          'Generate comprehensive unit and integration tests for code',                        1.00,  0.88, 3, ARRAY['claude-sonnet-4.5', 'gpt-4.1', 'o4-mini'],                    '{"strategy": "escalate", "start_tier": "balanced"}'),
    (NULL, 'sentiment_analysis',  'Sentiment Analysis',       'Analyze sentiment and emotional tone of text with confidence scores',               0.08,  0.90, 1, ARRAY['gpt-4.1-nano', 'gemini-2.0-flash', 'claude-3-haiku'],          '{"strategy": "single"}')
ON CONFLICT DO NOTHING;
