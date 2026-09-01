CREATE OR REPLACE FUNCTION auto_post_invoice_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only act if the status was changed to POSTED (or PAID for cash sales)
    IF NEW.status IN ('POSTED', 'PAID') AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('POSTED', 'PAID')) THEN
        -- The post_invoice function might attempt to update the invoice again.
        -- To avoid infinite loops, the post_invoice RPC or function needs to handle it
        -- OR we can just embed the logic. But let's check if it causes a loop.
        -- Actually, the post_invoice RPC currently executes an UPDATE on docs_invoices.
        -- Doing this in an AFTER trigger could cause recursion if not guarded.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
