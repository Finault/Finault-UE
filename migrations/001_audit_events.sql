-- Pomel/Lê-Quôc: Event telemetry for audit tool
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bejoptgsrhmklmllkobu/sql

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event text NOT NULL,
  data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- RLS: anon can insert events but never read them
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon inserts" ON public.audit_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "No reads for anon" ON public.audit_events FOR SELECT TO anon USING (false);

-- Index for dashboard queries
CREATE INDEX idx_audit_events_event ON public.audit_events(event);
CREATE INDEX idx_audit_events_created ON public.audit_events(created_at DESC);
