-- Migration 033: Batched spend increment RPC
-- Supports Build 4: KV Cleanup — Batched Writes

CREATE TABLE IF NOT EXISTS monthly_spend (
  org_id TEXT NOT NULL,
  customer_id TEXT,
  month TEXT NOT NULL,
  total_spend NUMERIC DEFAULT 0,
  PRIMARY KEY (org_id, customer_id, month)
);

CREATE OR REPLACE FUNCTION increment_spend(
  p_org_id TEXT,
  p_customer_id TEXT,
  p_month TEXT,
  p_amount NUMERIC
) RETURNS void AS $$
BEGIN
  INSERT INTO monthly_spend (org_id, customer_id, month, total_spend)
  VALUES (p_org_id, COALESCE(p_customer_id, '__all__'), p_month, p_amount)
  ON CONFLICT (org_id, customer_id, month)
  DO UPDATE SET total_spend = monthly_spend.total_spend + p_amount;
END;
$$ LANGUAGE plpgsql;
