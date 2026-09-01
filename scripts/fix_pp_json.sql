CREATE OR REPLACE FUNCTION post_payment(p_payment_id text, p_company_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_journal_id TEXT;
    v_effective_company_id TEXT;
    v_amount NUMERIC;
    v_partner_acc TEXT;
    v_liquidity_acc TEXT;
    v_is_receipt BOOLEAN;
    v_is_refund BOOLEAN;
    v_ref_val TEXT;
    v_contact_id TEXT;
    v_date TIMESTAMP;
BEGIN
    -- 1. Fetch payment
    SELECT * INTO v_payment FROM docs_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
    END IF;

    -- Only draft payments can be posted
    IF v_payment.status = 'POSTED' THEN
        -- It's already posted, theoretically should we return success or error? Let's just return success if the journal exists
        v_journal_id := 'JE-' || CASE WHEN v_payment.type IN ('RECEIPT', 'REFUND_IN') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', '');
        IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
            RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id, 'message', 'Already posted');
        END IF;
        -- If status is POSTED but no journal, proceed to recreate it
    END IF;

    -- 2. Setup variables
    v_amount := COALESCE(v_payment.amount, (v_payment.data->>'amount')::numeric, 0);
    v_is_receipt := v_payment.type IN ('RECEIPT', 'REFUND_IN');
    v_is_refund := v_payment.type IN ('REFUND_IN', 'REFUND_OUT');
    v_date := COALESCE(v_payment.date, v_payment.payment_date, CURRENT_DATE);
    v_contact_id := v_payment.contact_id;
    v_effective_company_id := COALESCE(p_company_id, v_payment.company_id);
    
    v_journal_id := 'JE-' || CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', '');

    -- 3. Prepare ACCOUNTS
    -- A) Setup partner account
    v_partner_acc := COALESCE(
      (SELECT id FROM docs_accounts WHERE type = (CASE WHEN v_is_receipt AND NOT v_is_refund THEN 'ACCOUNTS_RECEIVABLE' WHEN v_is_refund AND v_is_receipt THEN 'ACCOUNTS_PAYABLE' WHEN v_is_refund AND NOT v_is_receipt THEN 'ACCOUNTS_RECEIVABLE' ELSE 'ACCOUNTS_PAYABLE' END) AND company_id = v_effective_company_id LIMIT 1),
      (SELECT id FROM docs_accounts WHERE type = (CASE WHEN v_is_receipt AND NOT v_is_refund THEN 'ACCOUNTS_RECEIVABLE' WHEN v_is_refund AND v_is_receipt THEN 'ACCOUNTS_PAYABLE' WHEN v_is_refund AND NOT v_is_receipt THEN 'ACCOUNTS_RECEIVABLE' ELSE 'ACCOUNTS_PAYABLE' END) LIMIT 1)
    );

    -- B) Setup liquidity account
    IF v_payment.account_id IS NOT NULL AND v_payment.account_id <> '' THEN
       v_liquidity_acc := v_payment.account_id;
    ELSE 
       v_liquidity_acc := COALESCE(
         (SELECT id FROM docs_accounts WHERE type IN ('CASH', 'BANK') AND company_id = v_effective_company_id LIMIT 1),
         (SELECT id FROM docs_accounts WHERE type IN ('CASH', 'BANK') LIMIT 1)
       );
    END IF;

    IF v_partner_acc IS NULL OR v_liquidity_acc IS NULL THEN
        RAISE EXCEPTION 'A required account (Partner/Liquidity) could not be resolved. Partner: %, Liquidity: %', v_partner_acc, v_liquidity_acc;
    END IF;

    -- 4. Create/Upsert Journal
    v_ref_val := COALESCE(v_payment.payment_number, v_payment.id);
    IF v_payment.reference IS NOT NULL AND v_payment.reference <> '' THEN
        v_ref_val := v_ref_val || ' (' || v_payment.reference || ')';
    END IF;

    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at)
    VALUES (
      v_journal_id, 
      v_effective_company_id, 
      v_date, 
      v_date,
      CASE WHEN v_is_receipt THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 
      'POSTED', 
      v_ref_val, 
      v_payment.id, 
      COALESCE(v_payment.data->>'preparedBy', v_payment.data->>'salesperson', 'System'),
      v_payment.data->>'createdById',
      NOW()
    ) ON CONFLICT (id) DO UPDATE SET status = 'POSTED', updated_at = NOW();

    -- Ensure lines are fresh
    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- Create docs_journal_lines depending on direction
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-liq', v_journal_id, v_effective_company_id, v_liquidity_acc, v_contact_id, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, COALESCE('Payment: ' || v_ref_val, 'Payment: ' || v_payment.id));
    
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-part', v_journal_id, v_effective_company_id, v_partner_acc, v_contact_id, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, COALESCE('Reconciliation: ' || v_ref_val, 'Payment reconciliation: ' || v_payment.id));

    -- Set Payment status to POSTED
    UPDATE docs_payments 
    SET status = 'POSTED',
        data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'),
        updated_at = NOW() 
    WHERE id = p_payment_id;

    -- Update with FULL JSON document
    UPDATE docs_journals 
    SET data = jsonb_build_object(
        'id', id,
        'date', date,
        'status', status,
        'companyId', company_id,
        'reference', reference_number,
        'journalType', journal_type,
        'preparedBy', prepared_by,
        'createdById', created_by_id,
        'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', jl.id, 'accountId', jl.account_id, 'contactId', jl.contact_id, 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) FROM docs_journal_lines jl WHERE jl.journal_id = docs_journals.id), '[]'::jsonb)
    )
    WHERE id = v_journal_id;

    -- Also process logic to update invoices status if applied
    PERFORM apply_payment_to_invoices(v_payment.data);

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$;
