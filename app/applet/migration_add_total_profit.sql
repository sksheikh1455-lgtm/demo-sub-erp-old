-- ====================================================================
-- Migration: Add total_profit to docs_invoices and sync automatically
-- Description:
--   1. Adds 'total_profit' column to 'docs_invoices'.
--   2. Creates helper function 'calculate_invoice_total_profit'.
--   3. Creates a trigger function to compute and set 'total_profit' on docs_invoice_lines updates.
--   4. Creates a trigger function to compute and set 'total_profit' on docs_invoices header changes.
--   5. Backfills historical data with calculated figures.
-- ====================================================================

BEGIN;

-- 1. Add total_profit column to docs_invoices table safely
ALTER TABLE docs_invoices ADD COLUMN IF NOT EXISTS total_profit NUMERIC DEFAULT 0;

-- 2. Create optimized profit calculation helper function
CREATE OR REPLACE FUNCTION calculate_invoice_total_profit(p_invoice_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v_profit NUMERIC;
BEGIN
    SELECT COALESCE(SUM((quantity * unit_price) - (quantity * COALESCE(cost_price_at_sale, 0))), 0)
    INTO v_profit
    FROM docs_invoice_lines
    WHERE invoice_id = p_invoice_id;
    
    RETURN v_profit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create invoice lines trigger function to capture line updates
CREATE OR REPLACE FUNCTION trg_fn_update_invoice_profit_on_line_change()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;

    IF v_invoice_id IS NOT NULL THEN
        UPDATE docs_invoices
        SET total_profit = calculate_invoice_total_profit(v_invoice_id)
        WHERE id = v_invoice_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create invoices header trigger function to capture header status changes (e.g. DRAFT -> POSTED) or other direct updates
CREATE OR REPLACE FUNCTION trg_fn_update_invoice_profit_on_header_change()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_profit := calculate_invoice_total_profit(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Drop and recreate triggers safely to prevent integrity failures
DROP TRIGGER IF EXISTS trg_update_invoice_profit_on_line_change ON docs_invoice_lines;
CREATE TRIGGER trg_update_invoice_profit_on_line_change
AFTER INSERT OR UPDATE OR DELETE ON docs_invoice_lines
FOR EACH ROW
EXECUTE FUNCTION trg_fn_update_invoice_profit_on_line_change();

DROP TRIGGER IF EXISTS trg_update_invoice_profit_on_header_change ON docs_invoices;
CREATE TRIGGER trg_update_invoice_profit_on_header_change
BEFORE INSERT OR UPDATE ON docs_invoices
FOR EACH ROW
EXECUTE FUNCTION trg_fn_update_invoice_profit_on_header_change();

-- 6. Backward-reconcile existing invoices with historical profit figures
UPDATE docs_invoices i
SET total_profit = COALESCE((
    SELECT SUM((il.quantity * il.unit_price) - (il.quantity * COALESCE(il.cost_price_at_sale, 0)))
    FROM docs_invoice_lines il
    WHERE il.invoice_id = i.id
), 0);

COMMIT;
