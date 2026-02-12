-- Migration 010: Allow Verification Column Updates (Gap #4 Fix)
-- =============================================================================
--
-- PROBLEM: The anchors table has an INSERT-only trigger that blocks ALL updates,
--          including updates to the verification cache columns we just added.
--
-- SOLUTION: Modify the trigger to allow updates ONLY to verification columns.
--           Core anchor data remains immutable (INSERT-only), but verification
--           results can be cached.
--
-- SECURITY: This maintains audit trail immutability for:
--           - anchor_id, close_id, tx_hash, block_number, merkle_root, etc.
--           While allowing blockchain verification results to be cached:
--           - verified, verified_at, verification_error, confirmations, rpc_provider
--
-- =============================================================================

-- Drop the old INSERT-only trigger
DROP TRIGGER IF EXISTS prevent_anchors_update_delete ON anchors;
DROP FUNCTION IF EXISTS prevent_anchors_update_delete();

-- Create new trigger function that allows ONLY verification column updates
CREATE OR REPLACE FUNCTION prevent_anchors_update_delete_except_verification()
RETURNS TRIGGER AS $$
BEGIN
    -- Block ALL deletes (no exceptions)
    IF (TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'anchors table is INSERT-only. Deletes are prohibited.';
    END IF;

    -- Allow updates ONLY to verification cache columns
    IF (TG_OP = 'UPDATE') THEN
        -- Check if ANY non-verification column was changed
        IF (
            OLD.anchor_id IS DISTINCT FROM NEW.anchor_id OR
            OLD.close_id IS DISTINCT FROM NEW.close_id OR
            OLD.pack_type IS DISTINCT FROM NEW.pack_type OR
            OLD.network IS DISTINCT FROM NEW.network OR
            OLD.tx_hash IS DISTINCT FROM NEW.tx_hash OR
            OLD.block_number IS DISTINCT FROM NEW.block_number OR
            OLD.block_timestamp IS DISTINCT FROM NEW.block_timestamp OR
            OLD.confirmation_count IS DISTINCT FROM NEW.confirmation_count OR
            OLD.anchor_payload_sha256 IS DISTINCT FROM NEW.anchor_payload_sha256 OR
            OLD.merkle_root_sha256 IS DISTINCT FROM NEW.merkle_root_sha256 OR
            OLD.zip_sha256 IS DISTINCT FROM NEW.zip_sha256 OR
            OLD.status IS DISTINCT FROM NEW.status OR
            OLD.anchored_at IS DISTINCT FROM NEW.anchored_at OR
            OLD.error_message IS DISTINCT FROM NEW.error_message OR
            OLD.created_at IS DISTINCT FROM NEW.created_at
        ) THEN
            RAISE EXCEPTION 'anchors table: Core anchor data is immutable. Only verification columns can be updated.';
        END IF;

        -- If we got here, only verification columns were changed (or nothing changed)
        -- Allow the update
        RETURN NEW;
    END IF;

    -- Should never reach here, but just in case
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the new trigger
CREATE TRIGGER prevent_anchors_update_delete_except_verification
    BEFORE UPDATE OR DELETE ON anchors
    FOR EACH ROW
    EXECUTE FUNCTION prevent_anchors_update_delete_except_verification();

-- Verification: This allows updates to these columns ONLY:
--   - verified
--   - verified_at
--   - verification_error
--   - confirmations_at_verification
--   - rpc_provider
--
-- All other columns remain immutable (INSERT-only).
