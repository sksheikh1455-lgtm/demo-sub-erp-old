CREATE OR REPLACE FUNCTION post_inventory_adjustment(p_adj_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_adj RECORD;
    v_journal_id TEXT;
    v_effective_company_id TEXT;
    v_item JSONB;
    v_prod RECORD;
    v_current_qty NUMERIC;
    v_diff NUMERIC;
    v_valuation NUMERIC;
    v_inv_acc TEXT;
    v_exp_acc TEXT;
    v_total_debit NUMERIC := 0;
    v_target_wh TEXT;
    v_cost_id TEXT;
    v_existing_cost RECORD;
BEGIN
    -- 1. Get Adjustment
    SELECT * INTO v_adj FROM docs_inventory_adjustments WHERE id = p_adj_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Adjustment not found'); END IF;

    IF v_adj.status = 'POSTED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already posted');
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_adj.company_id, v_adj.data->>'companyId');

    -- Setup standard accounts
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_exp_acc FROM docs_accounts WHERE code = '500501' AND company_id = v_effective_company_id LIMIT 1;

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    SELECT id INTO v_journal_id FROM docs_journals 
    WHERE company_id = v_effective_company_id AND reference_number = v_adj.data->>'number' LIMIT 1;

    IF v_journal_id IS NULL THEN
        v_journal_id := 'JE-ADJ-' || replace(UPPER(v_adj.id), 'ADJ-', '');
    END IF;

    -- Delete old journal lines just in case
    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    v_target_wh := COALESCE(v_adj.data->>'warehouseId', 'WH-MAIN-' || v_effective_company_id);

    -- Loop through items
    FOR v_item IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_adj.data->'items') = 'array' THEN v_adj.data->'items' ELSE '[]'::jsonb END) LOOP
        SELECT id, data, cost_price INTO v_prod FROM docs_products WHERE id = v_item->>'productId' FOR UPDATE;
        IF FOUND THEN
            v_current_qty := COALESCE((v_prod.data->'stockLevels'->>v_effective_company_id)::numeric, 0);
            v_diff := (v_item->>'newQty')::numeric - v_current_qty;
            v_valuation := ABS(v_diff * COALESCE(v_prod.cost_price, 0));

            IF v_valuation > 0 THEN
                -- Insert Journal Lines for this item
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-I-' || v_prod.id, v_journal_id, v_effective_company_id, v_inv_acc, 
                        CASE WHEN v_diff > 0 THEN v_valuation ELSE 0 END, CASE WHEN v_diff < 0 THEN v_valuation ELSE 0 END, 
                        'Stock Adjustment: ' || (v_prod.data->>'name'));

                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                VALUES ('JL-' || v_journal_id || '-E-' || v_prod.id, v_journal_id, v_effective_company_id, v_exp_acc, 
                        CASE WHEN v_diff < 0 THEN v_valuation ELSE 0 END, CASE WHEN v_diff > 0 THEN v_valuation ELSE 0 END, 
                        'Inventory Adjustment Expense: ' || (v_prod.data->>'name'), v_adj.data->>'contactId');
            END IF;

            -- Inventory Transaction
            INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, data, updated_at)
            VALUES ('mov-adj-' || v_adj.id || '-' || v_prod.id, v_effective_company_id, v_prod.id, v_target_wh, 
                    CASE WHEN v_diff >= 0 THEN 'IN' ELSE 'OUT' END, ABS(v_diff), v_adj.id, 'ADJUSTMENT', (v_adj.data->>'date')::date, COALESCE(v_prod.cost_price, 0),
                    jsonb_build_object('id', 'mov-adj-' || v_adj.id || '-' || v_prod.id, 'companyId', v_effective_company_id, 'productId', v_prod.id, 'warehouseId', v_target_wh, 'transactionType', CASE WHEN v_diff >= 0 THEN 'IN' ELSE 'OUT' END, 'quantity', ABS(v_diff), 'referenceId', v_adj.id, 'referenceType', 'ADJUSTMENT', 'date', v_adj.data->>'date', 'costPrice', COALESCE(v_prod.cost_price, 0)),
                    NOW());

            -- Update Product Stock Level
            UPDATE docs_products 
            SET data = jsonb_set(
                jsonb_set(data, array['stockLevels', v_effective_company_id], (v_item->'newQty')),
                '{quantityOnHand}', (v_item->'newQty')
            )
            WHERE id = v_prod.id;

            -- Update Cost Pool
            v_cost_id := v_effective_company_id || ':' || v_prod.id || ':' || v_target_wh;
            SELECT * INTO v_existing_cost FROM docs_product_costs WHERE id = v_cost_id FOR UPDATE;
            IF FOUND THEN
                UPDATE docs_product_costs 
                SET data = jsonb_set(
                            jsonb_set(data, '{totalQty}', ((data->>'totalQty')::numeric + v_diff)::text::jsonb), 
                            '{totalValue}', (((data->>'totalQty')::numeric + v_diff) * COALESCE(v_prod.cost_price, 0))::text::jsonb)
                WHERE id = v_cost_id;
            ELSE
                INSERT INTO docs_product_costs (id, company_id, product_id, warehouse_id, data, updated_at)
                VALUES (v_cost_id, v_effective_company_id, v_prod.id, v_target_wh, 
                        jsonb_build_object('id', v_cost_id, 'companyId', v_effective_company_id, 'productId', v_prod.id, 'warehouseId', v_target_wh, 'avgCost', COALESCE(v_prod.cost_price, 0), 'totalQty', (v_item->>'newQty')::numeric, 'totalValue', (v_item->>'newQty')::numeric * COALESCE(v_prod.cost_price, 0)), 
                        NOW());
            END IF;

        END IF;
    END LOOP;

    -- Upsert Journal Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, (v_adj.data->>'date')::date, 'INVENTORY', 'POSTED', v_adj.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_adj.data->>'date', 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_adj.data->>'number', 'journalType', 'INVENTORY', 'preparedBy', COALESCE(v_adj.data->>'preparedBy', 'System'), 'createdById', v_adj.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED';

    -- Mark Adjustment as POSTED
    UPDATE docs_inventory_adjustments SET status = 'POSTED', data = jsonb_set(data, '{status}', '"POSTED"') WHERE id = p_adj_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
