-- ═══════════════════════════════════════════════════════════════════
-- FINAULT GOLD-TIER DEMO DATA SEED
-- Run this in Supabase SQL Editor to populate realistic demo data
-- ═══════════════════════════════════════════════════════════════════

-- Create a demo organization
INSERT INTO organizations (id, name, slug, settings)
VALUES (
  'org_demo_acme_corp',
  'Acme Corporation',
  'acme-corp',
  '{"default_currency": "USD", "fiscal_year_start": 1, "employee_count": 500, "erp_system": "quickbooks_online"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- GATEWAY LOGS - 30 days of realistic AI usage
-- ═══════════════════════════════════════════════════════════════════

-- Generate usage data for the past 30 days
INSERT INTO gateway_logs (
  organization_id, request_id, timestamp, provider, model,
  cost_center, project, environment, user_id, feature,
  input_tokens, output_tokens, total_tokens, estimated_cost,
  latency_ms, status, path
)
SELECT
  'org_demo_acme_corp' as organization_id,
  'req_' || gen_random_uuid()::text as request_id,
  NOW() - (random() * interval '30 days') as timestamp,
  (ARRAY['openai', 'anthropic', 'azure-openai'])[floor(random() * 3 + 1)] as provider,
  (ARRAY['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'claude-3-haiku', 'gpt-4-turbo'])[floor(random() * 5 + 1)] as model,
  (ARRAY['ENG-001', 'PROD-002', 'DATA-001', 'SUP-001', 'MKT-001'])[floor(random() * 5 + 1)] as cost_center,
  (ARRAY['platform-api', 'customer-support-bot', 'data-pipeline', 'content-generator', 'code-assistant'])[floor(random() * 5 + 1)] as project,
  (ARRAY['production', 'staging', 'development'])[floor(random() * 3 + 1)] as environment,
  'user_' || floor(random() * 50 + 1)::text as user_id,
  (ARRAY['chat', 'completion', 'embedding', 'analysis'])[floor(random() * 4 + 1)] as feature,
  floor(random() * 8000 + 500)::int as input_tokens,
  floor(random() * 4000 + 200)::int as output_tokens,
  floor(random() * 12000 + 700)::int as total_tokens,
  (random() * 2.5 + 0.01)::numeric(10,4) as estimated_cost,
  floor(random() * 3000 + 100)::int as latency_ms,
  'success' as status,
  '/v1/chat/completions' as path
FROM generate_series(1, 5000);

-- Add some high-cost anomalous entries (for anomaly detection demo)
INSERT INTO gateway_logs (
  organization_id, request_id, timestamp, provider, model,
  cost_center, project, environment, user_id, feature,
  input_tokens, output_tokens, total_tokens, estimated_cost,
  latency_ms, status, path
)
VALUES
  ('org_demo_acme_corp', 'req_anomaly_1', NOW() - interval '3 days', 'openai', 'gpt-4-turbo', 'ENG-001', 'platform-api', 'production', 'user_12', 'completion', 45000, 22000, 67000, 28.50, 15000, 'success', '/v1/chat/completions'),
  ('org_demo_acme_corp', 'req_anomaly_2', NOW() - interval '5 days', 'anthropic', 'claude-3.5-sonnet', 'DATA-001', 'data-pipeline', 'production', 'user_8', 'analysis', 120000, 45000, 165000, 52.80, 45000, 'success', '/v1/messages'),
  ('org_demo_acme_corp', 'req_anomaly_3', NOW() - interval '1 day', 'openai', 'gpt-4o', 'PROD-002', 'content-generator', 'production', 'user_22', 'completion', 85000, 35000, 120000, 18.75, 8000, 'success', '/v1/chat/completions');

-- ═══════════════════════════════════════════════════════════════════
-- ANOMALIES - Detected spending anomalies
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO anomalies (
  id, org_id, type, severity, title, description,
  metric_value, expected_value, deviation_percent,
  detected_at, acknowledged, metadata
)
VALUES
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'cost_spike',
    'high',
    'Unusual GPT-4 Turbo spend detected',
    'Engineering team (ENG-001) spent 340% above normal on GPT-4 Turbo in the past 24 hours. This appears linked to the platform-api project.',
    28.50,
    6.50,
    338.46,
    NOW() - interval '3 days',
    false,
    '{"cost_center": "ENG-001", "model": "gpt-4-turbo", "project": "platform-api"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'volume_spike',
    'critical',
    'Data pipeline token usage surge',
    'The data-pipeline project consumed 165,000 tokens in a single request - 8x the typical maximum. Review for potential infinite loops or misconfiguration.',
    165000,
    20000,
    725.00,
    NOW() - interval '5 days',
    false,
    '{"cost_center": "DATA-001", "model": "claude-3.5-sonnet", "project": "data-pipeline"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'cost_spike',
    'medium',
    'Content generator cost increase',
    'Product team content generation costs increased 85% week-over-week. May be related to new marketing campaign.',
    18.75,
    10.12,
    85.28,
    NOW() - interval '1 day',
    true,
    '{"cost_center": "PROD-002", "model": "gpt-4o", "project": "content-generator", "acknowledged_by": "jane@acme.com"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'budget_threshold',
    'high',
    'Engineering budget 80% consumed',
    'ENG-001 has consumed 80% of monthly budget with 12 days remaining. At current rate, will exceed by ~$2,400.',
    8000.00,
    6500.00,
    23.08,
    NOW() - interval '2 days',
    false,
    '{"cost_center": "ENG-001", "budget_id": "budget_eng_monthly", "projected_overage": 2400}'::jsonb
  );

-- ═══════════════════════════════════════════════════════════════════
-- ALLOCATION RULES - Cost center mapping rules
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO allocation_rules (
  id, organization_id, name, description, match_field, match_type,
  match_value, cost_center, priority, is_active, metadata
)
VALUES
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'Platform Engineering',
    'All platform-api and infrastructure projects',
    'project',
    'prefix',
    'platform',
    'ENG-001',
    10,
    true,
    '{"department": "Engineering", "gl_account": "6100-AI-ENG"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'Customer Support AI',
    'Support bot and customer service automation',
    'project',
    'contains',
    'support',
    'SUP-001',
    20,
    true,
    '{"department": "Customer Success", "gl_account": "6100-AI-SUP"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'Data Science & Analytics',
    'Data pipeline and analytics workloads',
    'project',
    'contains',
    'data',
    'DATA-001',
    30,
    true,
    '{"department": "Data Science", "gl_account": "6100-AI-DATA"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'Product AI Features',
    'Customer-facing AI features and content',
    'project',
    'contains',
    'content',
    'PROD-002',
    40,
    true,
    '{"department": "Product", "gl_account": "6100-AI-PROD"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'Marketing Automation',
    'Marketing content and campaign AI',
    'cost_center',
    'exact',
    'MKT-001',
    'MKT-001',
    50,
    true,
    '{"department": "Marketing", "gl_account": "6100-AI-MKT"}'::jsonb
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'Development & Testing',
    'Non-production AI usage',
    'environment',
    'in',
    'development,staging',
    'ENG-002',
    100,
    true,
    '{"department": "Engineering", "gl_account": "6100-AI-DEV", "note": "Catch-all for non-prod"}'::jsonb
  );

-- ═══════════════════════════════════════════════════════════════════
-- BUDGETS - Monthly and team budgets
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO budgets (
  id, organization_id, name, amount, period, cost_center,
  alert_threshold, hard_limit, current_spend, is_active
)
VALUES
  (
    'budget_company_monthly',
    'org_demo_acme_corp',
    'Company-Wide AI Budget',
    50000.00,
    'monthly',
    NULL,
    0.80,
    false,
    38750.00,
    true
  ),
  (
    'budget_eng_monthly',
    'org_demo_acme_corp',
    'Engineering Monthly',
    10000.00,
    'monthly',
    'ENG-001',
    0.75,
    true,
    8000.00,
    true
  ),
  (
    'budget_data_monthly',
    'org_demo_acme_corp',
    'Data Science Monthly',
    8000.00,
    'monthly',
    'DATA-001',
    0.80,
    false,
    5200.00,
    true
  ),
  (
    'budget_prod_monthly',
    'org_demo_acme_corp',
    'Product Team Monthly',
    12000.00,
    'monthly',
    'PROD-002',
    0.85,
    false,
    9800.00,
    true
  ),
  (
    'budget_support_monthly',
    'org_demo_acme_corp',
    'Customer Support Monthly',
    5000.00,
    'monthly',
    'SUP-001',
    0.90,
    true,
    3100.00,
    true
  ),
  (
    'budget_mkt_monthly',
    'org_demo_acme_corp',
    'Marketing Monthly',
    3000.00,
    'monthly',
    'MKT-001',
    0.75,
    false,
    1850.00,
    true
  );

-- ═══════════════════════════════════════════════════════════════════
-- INVOICES - Sample parsed invoices
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO invoices (
  id, organization_id, provider, invoice_number,
  period_start, period_end, total_amount, currency,
  status, line_items, metadata, created_at
)
VALUES
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'openai',
    'INV-2026-01-OPENAI',
    '2026-01-01',
    '2026-01-31',
    24850.00,
    'USD',
    'processed',
    '[
      {"model": "gpt-4o", "cost": 12500.00, "input_tokens": 45000000, "output_tokens": 8500000},
      {"model": "gpt-4o-mini", "cost": 4200.00, "input_tokens": 180000000, "output_tokens": 42000000},
      {"model": "gpt-4-turbo", "cost": 6150.00, "input_tokens": 12000000, "output_tokens": 5800000},
      {"model": "text-embedding-3-small", "cost": 2000.00, "input_tokens": 850000000, "output_tokens": 0}
    ]'::jsonb,
    '{"parsed_at": "2026-01-29T10:30:00Z", "parser_version": "3.0.0", "hash": "a1b2c3d4e5f6"}'::jsonb,
    NOW() - interval '1 day'
  ),
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    'anthropic',
    'INV-2026-01-ANTHROPIC',
    '2026-01-01',
    '2026-01-31',
    13900.00,
    'USD',
    'processed',
    '[
      {"model": "claude-3.5-sonnet", "cost": 8500.00, "input_tokens": 28000000, "output_tokens": 4200000},
      {"model": "claude-3-haiku", "cost": 3200.00, "input_tokens": 95000000, "output_tokens": 18000000},
      {"model": "claude-3-opus", "cost": 2200.00, "input_tokens": 1800000, "output_tokens": 420000}
    ]'::jsonb,
    '{"parsed_at": "2026-01-29T10:35:00Z", "parser_version": "3.0.0", "hash": "f6e5d4c3b2a1"}'::jsonb,
    NOW() - interval '1 day'
  );

-- ═══════════════════════════════════════════════════════════════════
-- CLOSE PACKS - Generated compliance packages
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO close_packs (
  id, organization_id, period, status,
  total_spend, cost_center_breakdown, model_breakdown,
  cert_id, generated_at, metadata
)
VALUES
  (
    gen_random_uuid(),
    'org_demo_acme_corp',
    '2025-12',
    'completed',
    42350.00,
    '{
      "ENG-001": {"amount": 14200.00, "percentage": 33.5},
      "PROD-002": {"amount": 11800.00, "percentage": 27.9},
      "DATA-001": {"amount": 8500.00, "percentage": 20.1},
      "SUP-001": {"amount": 4850.00, "percentage": 11.5},
      "MKT-001": {"amount": 3000.00, "percentage": 7.1}
    }'::jsonb,
    '{
      "gpt-4o": {"amount": 18500.00, "percentage": 43.7},
      "claude-3.5-sonnet": {"amount": 12200.00, "percentage": 28.8},
      "gpt-4o-mini": {"amount": 6800.00, "percentage": 16.1},
      "claude-3-haiku": {"amount": 4850.00, "percentage": 11.5}
    }'::jsonb,
    'CERT-202512-847291',
    NOW() - interval '30 days',
    '{"documents": ["executive-summary.pdf", "journal-entry.xlsx", "reconciliation-cert.pdf", "controls-narrative.pdf", "evidence-bundle.json"], "hash_chain": "9f8e7d6c5b4a3210"}'::jsonb
  );

-- ═══════════════════════════════════════════════════════════════════
-- Verify data was inserted
-- ═══════════════════════════════════════════════════════════════════

SELECT 'gateway_logs' as table_name, COUNT(*) as row_count FROM gateway_logs WHERE organization_id = 'org_demo_acme_corp'
UNION ALL
SELECT 'anomalies', COUNT(*) FROM anomalies WHERE org_id = 'org_demo_acme_corp'
UNION ALL
SELECT 'allocation_rules', COUNT(*) FROM allocation_rules WHERE organization_id = 'org_demo_acme_corp'
UNION ALL
SELECT 'budgets', COUNT(*) FROM budgets WHERE organization_id = 'org_demo_acme_corp'
UNION ALL
SELECT 'invoices', COUNT(*) FROM invoices WHERE organization_id = 'org_demo_acme_corp'
UNION ALL
SELECT 'close_packs', COUNT(*) FROM close_packs WHERE organization_id = 'org_demo_acme_corp';
