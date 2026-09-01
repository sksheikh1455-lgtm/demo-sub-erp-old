-- Create RPC to automatically post depreciation journals
CREATE OR REPLACE FUNCTION process_depreciation(p_asset_id TEXT, p_company_id TEXT, p_amount NUMERIC, p_date DATE, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    v_journal_id TEXT;
    v_dep_exp_acc TEXT;
    v_acc_dep_acc TEXT;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Depreciation amount must be greater than zero');
    END IF;

    -- Lookup Accounts for Depreciation
    -- 50030/5003 could be Depreciation Expense, 10020 could be Accumulated Depreciation
    SELECT id INTO v_dep_exp_acc FROM docs_accounts WHERE code IN ('50030', '5003') OR name ILIKE '%Depreciation Expense%' AND company_id = p_company_id LIMIT 1;
    IF v_dep_exp_acc IS NULL THEN v_dep_exp_acc := 'unknown_dep_exp'; END IF;

    SELECT id INTO v_acc_dep_acc FROM docs_accounts WHERE code IN ('10020', '1002') OR name ILIKE '%Accumulated Depreciation%' AND company_id = p_company_id LIMIT 1;
    IF v_acc_dep_acc IS NULL THEN v_acc_dep_acc := 'unknown_acc_dep'; END IF;

    v_journal_id := gen_random_uuid()::TEXT;
    
    INSERT INTO docs_journals (id, company_id, date, reference, description, status, data, created_at, updated_at)
    VALUES (
        v_journal_id, p_company_id, p_date, 'DEP-' || p_asset_id,
        'Depreciation for Asset ' || p_asset_id || COALESCE(' - ' || p_reason, ''),
        'POSTED',
        jsonb_build_object(
            'reference', 'DEP-' || p_asset_id,
            'lines', jsonb_build_array(
                jsonb_build_object(
                    'id', gen_random_uuid()::TEXT,
                    'accountId', v_dep_exp_acc,
                    'debit', p_amount,
                    'credit', 0,
                    'description', 'Depreciation Expense'
                ),
                jsonb_build_object(
                    'id', gen_random_uuid()::TEXT,
                    'accountId', v_acc_dep_acc,
                    'debit', 0,
                    'credit', p_amount,
                    'description', 'Accumulated Depreciation'
                )
            )
        ),
        NOW(), NOW()
    );

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
