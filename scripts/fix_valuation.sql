
CREATE OR REPLACE FUNCTION reconcile_inventory(p_company_id TEXT)
RETURNS void AS $$
DECLARE
    v_total_valuation NUMERIC(16,2) := 0;
    v_ledger_balance NUMERIC(16,2) := 0;
    v_discrepancy NUMERIC(16,2);
    v_inventory_account_id TEXT;
    v_offset_account_id TEXT;
    v_journal_id TEXT;
    v_line1_id TEXT;
    v_line2_id TEXT;
BEGIN
    SELECT COALESCE(SUM(calc.qoh * COALESCE(p.cost_price, 0)), 0)
    INTO v_total_valuation
    FROM docs_products p
    JOIN LATERAL (
        SELECT COALESCE(SUM(
            CASE WHEN t.transaction_type = 'IN' THEN t.quantity ELSE -t.quantity END
        ), p.quantity_on_hand, 0) as qoh
        FROM docs_inventory_transactions t
        WHERE t.product_id = p.id AND t.company_id = p_company_id
    ) calc ON true
    WHERE p.company_id = p_company_id;

    SELECT id INTO v_inventory_account_id FROM docs_accounts 
    WHERE company_id = p_company_id AND (code = '100501' OR code = '100500' OR sub_type = 'INVENTORY')
    LIMIT 1;

    IF v_inventory_account_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(l.debit - l.credit), 0)
    INTO v_ledger_balance
    FROM docs_journal_lines l
    JOIN docs_journals j ON j.id = l.journal_id
    WHERE l.account_id = v_inventory_account_id AND j.status = 'POSTED';

    v_discrepancy := v_total_valuation - v_ledger_balance;

    IF ABS(v_discrepancy) > 0.01 THEN
        SELECT id INTO v_offset_account_id FROM docs_accounts 
        WHERE company_id = p_company_id AND (code = '300100' OR code = '300000' OR type = 'EQUITY' OR sub_type = 'EQUITY') LIMIT 1;
        
        IF v_offset_account_id IS NULL THEN
            SELECT id INTO v_offset_account_id FROM docs_accounts 
            WHERE company_id = p_company_id AND (code = '500501' OR name ILIKE '%adjustment%' OR type = 'EXPENSE') LIMIT 1;
        END IF;

        IF v_offset_account_id IS NULL THEN
            SELECT id INTO v_offset_account_id FROM docs_accounts 
            WHERE company_id = p_company_id AND sub_type = 'COGS' LIMIT 1;
        END IF;

        v_journal_id := gen_random_uuid()::TEXT;
        v_line1_id := gen_random_uuid()::TEXT;
        v_line2_id := gen_random_uuid()::TEXT;
        
        INSERT INTO docs_journals (id, company_id, date, reference, status, data, created_at)
        VALUES (
            v_journal_id, p_company_id, CURRENT_DATE, 'REVAL-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'POSTED', 
            jsonb_build_object(
                'description', 'Auto-Reconciliation: Inventory Valuation vs 100501 Ledger', 
                'source_type', 'REVALUATION',
                'lines', jsonb_build_array(
                    jsonb_build_object(
                        'id', v_line1_id,
                        'accountId', v_inventory_account_id,
                        'debit', CASE WHEN v_discrepancy > 0 THEN ABS(v_discrepancy) ELSE 0 END,
                        'credit', CASE WHEN v_discrepancy <= 0 THEN ABS(v_discrepancy) ELSE 0 END,
                        'description', 'Inventory Valuation Adjustment'
                    ),
                    jsonb_build_object(
                        'id', v_line2_id,
                        'accountId', v_offset_account_id,
                        'debit', CASE WHEN v_discrepancy <= 0 THEN ABS(v_discrepancy) ELSE 0 END,
                        'credit', CASE WHEN v_discrepancy > 0 THEN ABS(v_discrepancy) ELSE 0 END,
                        'description', 'Inventory Valuation Offset'
                    )
                )
            ), 
            NOW()
        );

        INSERT INTO docs_journal_lines (id, journal_id, account_id, debit, credit, description, created_at, company_id)
        VALUES 
            (v_line1_id, v_journal_id, v_inventory_account_id, 
             CASE WHEN v_discrepancy > 0 THEN ABS(v_discrepancy) ELSE 0 END, 
             CASE WHEN v_discrepancy <= 0 THEN ABS(v_discrepancy) ELSE 0 END, 
             'Inventory Valuation Adjustment', NOW(), p_company_id),
            (v_line2_id, v_journal_id, v_offset_account_id, 
             CASE WHEN v_discrepancy <= 0 THEN ABS(v_discrepancy) ELSE 0 END, 
             CASE WHEN v_discrepancy > 0 THEN ABS(v_discrepancy) ELSE 0 END, 
             'Inventory Valuation Offset', NOW(), p_company_id);
             
        RAISE NOTICE 'Revaluation applied for %: Discrepancy %', p_company_id, v_discrepancy;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
