CREATE TABLE IF NOT EXISTS stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  metadata JSONB DEFAULT '{}',
  finault_customer_id TEXT, -- matched Finault customer ID (null until matched)
  matched_method TEXT, -- 'auto_id', 'auto_email', 'auto_metadata', 'auto_name_fuzzy', 'manual'
  matched_at TIMESTAMPTZ,
  plan_name TEXT,
  plan_amount_cents INTEGER,
  plan_interval TEXT, -- 'month', 'year'
  subscription_status TEXT, -- 'active', 'canceled', 'past_due'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, stripe_customer_id)
);

CREATE INDEX idx_stripe_customers_org ON stripe_customers(org_id);
CREATE INDEX idx_stripe_customers_email ON stripe_customers(email);
CREATE INDEX idx_stripe_customers_finault_id ON stripe_customers(finault_customer_id);
CREATE INDEX idx_stripe_customers_unmatched ON stripe_customers(org_id) WHERE finault_customer_id IS NULL;
