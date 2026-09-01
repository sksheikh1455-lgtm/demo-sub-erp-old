-- Phase 4.7: Inventory Consistency & Atomicity

-- Add locking field to products
ALTER TABLE docs_products ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE docs_products ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;

-- RPC to perform atomic inventory adjustment with conflict detection
CREATE OR REPLACE FUNCTION atomic_inventory_update(
    p_product_id TEXT,
    p_company_id TEXT,
    p_qty_delta NUMERIC,
    p_expected_current_qty NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_actual_qty NUMERIC;
BEGIN
    -- 1. Get current qty and lock row
    SELECT (data->>'quantityOnHand')::numeric INTO v_actual_qty 
    FROM docs_products 
    WHERE id = p_product_id AND company_id = p_company_id
    FOR UPDATE;

    -- 2. Optimistic concurrency check
    IF v_actual_qty <> p_expected_current_qty THEN
        RAISE EXCEPTION 'Inventory Conflict: Product % qty changed from % to % by another process.', p_product_id, p_expected_current_qty, v_actual_qty;
    END IF;

    -- 3. Update
    UPDATE docs_products 
    SET data = data || jsonb_build_object('quantityOnHand', v_actual_qty + p_qty_delta),
        updated_at = now()
    WHERE id = p_product_id;

    RETURN jsonb_build_object('success', true, 'new_qty', v_actual_qty + p_qty_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
