CREATE OR REPLACE FUNCTION public.sync_product_inventory_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_product_id TEXT;
    v_stock_levels JSONB;
    v_total_qoh NUMERIC;
    v_r RECORD;
BEGIN
    -- Determine the product_id to update
    IF TG_OP = 'DELETE' THEN
        v_product_id := OLD.product_id;
    ELSE
        v_product_id := NEW.product_id;
    END IF;

    IF v_product_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Calculate stock levels per company and total QOH
    v_stock_levels := '{}'::jsonb;
    v_total_qoh := 0;

    FOR v_r IN (
        SELECT company_id, SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END) as company_qty
        FROM docs_inventory_transactions
        WHERE product_id = v_product_id
        GROUP BY company_id
    ) LOOP
        v_stock_levels := jsonb_set(v_stock_levels, ARRAY[v_r.company_id], to_jsonb(COALESCE(v_r.company_qty, 0)));
        v_total_qoh := v_total_qoh + COALESCE(v_r.company_qty, 0);
    END LOOP;

    -- Update the core docs_products table
    UPDATE docs_products
    SET quantity_on_hand = v_total_qoh,
        data = jsonb_set(
            jsonb_set(
                COALESCE(data, '{}'::jsonb),
                '{stockLevels}',
                v_stock_levels
            ),
            '{quantityOnHand}',
            to_jsonb(v_total_qoh)
        ),
        updated_at = NOW()
    WHERE id = v_product_id;

    -- If updated product has old product_id due to update, sync that too
    IF TG_OP = 'UPDATE' AND NEW.product_id <> OLD.product_id AND OLD.product_id IS NOT NULL THEN
        v_product_id := OLD.product_id;
        v_stock_levels := '{}'::jsonb;
        v_total_qoh := 0;

        FOR v_r IN (
            SELECT company_id, SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END) as company_qty
            FROM docs_inventory_transactions
            WHERE product_id = v_product_id
            GROUP BY company_id
        ) LOOP
            v_stock_levels := jsonb_set(v_stock_levels, ARRAY[v_r.company_id], to_jsonb(COALESCE(v_r.company_qty, 0)));
            v_total_qoh := v_total_qoh + COALESCE(v_r.company_qty, 0);
        END LOOP;

        UPDATE docs_products
        SET quantity_on_hand = v_total_qoh,
            data = jsonb_set(
                jsonb_set(
                    COALESCE(data, '{}'::jsonb),
                    '{stockLevels}',
                    v_stock_levels
                ),
                '{quantityOnHand}',
                to_jsonb(v_total_qoh)
            ),
            updated_at = NOW()
        WHERE id = v_product_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_product_inventory_totals ON docs_inventory_transactions;

CREATE TRIGGER trg_sync_product_inventory_totals
AFTER INSERT OR UPDATE OR DELETE ON docs_inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_inventory_totals();
