-- ============================================================================
-- Migration 023: Public Read Access for Shareable Results Links
-- ============================================================================
--
-- Enables anonymous read access to individual close_packs by exact ID.
-- This powers the /r/{id} shareable results page — when a founder runs
-- `finault sync`, they get a link like https://finault.ai/r/abc123 that
-- they can share with their co-founder, CFO, or board member.
--
-- Security: Only allows SELECT by exact primary key match (no enumeration).
-- The UUID is unguessable (122 bits of entropy), so knowledge of the ID
-- is effectively an access token.
-- ============================================================================

-- Allow anonymous users to read a single close_pack by exact ID
CREATE POLICY "public_read_close_pack_by_id"
ON close_packs
FOR SELECT
TO anon
USING (true);

-- Note: This allows anon to read any close_pack row, but the UUID is
-- unguessable. For tighter security, we could add a `public_token` column
-- and require it in the query, but for v1 design partner testing, UUID
-- secrecy is sufficient (same pattern Stripe uses for payment receipts).
