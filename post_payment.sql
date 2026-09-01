
DECLARE
    v_payment RECORD;
    v_journal_id TEXT;
    v_amount NUMERIC;
    v_date DATE;
    v_effective_company_id TEXT;
    v_contact_id TEXT;
    v_liquidity_acc TEXT;
    v_partner_acc TEXT;
    v_is_receipt BOOLEAN;
    v_is_refund BOOLEAN;
    v_ref_val TEXT;
    v_run_id TEXT := substr(md5(random()::text), 1, 8);
    v_inv_record RECORD;
    v_bill_record RECORD;
    v_alloc jsonb;
    v_new_amt_paid NUMERIC;
BEGIN
    SELECT * INTO v_payment FROM docs_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payment not found'); END IF;
    
    v_is_receipt := v_payment.type = 'RECEIPT' OR v_payment.type = 'COLLECTION';
    v_is_refund := v_payment.type = 'REFUND';
    v_amount := COALESCE(v_payment.amount, 0);
    v_date := COALESCE(v_payment.date, v_payment.payment_date, CURRENT_DATE);
    v_contact_id := v_payment.contact_id;
    v_effective_company_id := COALESCE(p_company_id, v_payment.company_id);
    
    v_journal_id := 'JE-' || CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', '');
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        UPDATE docs_payments SET status = 'POSTED', data = jsonb_set(jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'), '{journalEntryId}', to_jsonb(v_journal_id::text)), updated_at = NOW() WHERE id = p_payment_id;
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    IF v_effective_company_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Company ID missing'); END IF;

    v_liquidity_acc := v_payment.account_id;
    IF v_liquidity_acc IS NOT NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE id = v_liquidity_acc AND company_id = v_effective_company_id;
    END IF;
    IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN ('1011', '100100') AND company_id = v_effective_company_id LIMIT 1;
    END IF;
    IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE name ILIKE '%Cash%' AND company_id = v_effective_company_id LIMIT 1;
    END IF;
    IF v_liquidity_acc IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Liquidity account (Cash/Bank) not found. Company: ' || v_effective_company_id); 
    END IF;

    v_partner_acc := v_payment.partner_account_id;
    IF v_partner_acc IS NOT NULL THEN
        SELECT id INTO v_partner_acc FROM docs_accounts WHERE id = v_partner_acc AND company_id = v_effective_company_id;
    END IF;
    IF v_partner_acc IS NULL THEN
        SELECT id INTO v_partner_acc FROM docs_accounts WHERE code IN ('100201', '200101') AND company_id = v_effective_company_id 
        ORDER BY CASE WHEN v_is_receipt OR v_is_refund THEN (code = '100201') ELSE (code = '200101') END DESC LIMIT 1;
    END IF;
    IF v_partner_acc IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Partner account (AR/AP) not found. Company: ' || v_effective_company_id); 
    END IF;

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
      CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 
      'POSTED', 
      v_ref_val, 
      v_ref_val,
      'System', 
      NULL, 
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', updated_at = NOW();

    EXECUTE 'SET LOCAL core.bypass_audit = ''true''';
    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    EXECUTE 'SET LOCAL core.bypass_audit = ''false''';

    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
    VALUES ('JL-' || v_run_id || '-' || v_journal_id || '-liq', v_journal_id, v_effective_company_id, v_liquidity_acc, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, COALESCE('Payment: ' || v_ref_val, 'Payment: ' || v_payment.id));
    
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_run_id || '-' || v_journal_id || '-part', v_journal_id, v_effective_company_id, v_partner_acc, v_contact_id, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, COALESCE('Reconciliation: ' || v_ref_val, 'Payment reconciliation: ' || v_payment.id));

    -- EARLY UPDATE OF PAYMENT STATUS TO ENSURE TRIGGERS SEE IT POSTED!
    UPDATE docs_payments SET status = 'POSTED', data = jsonb_set(jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'), '{journalEntryId}', to_jsonb(v_journal_id::text)), updated_at = NOW() WHERE id = p_payment_id;

    IF v_is_receipt AND v_payment.applied_invoices IS NOT NULL THEN
        FOR v_alloc IN SELECT * FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_payment.applied_invoices) = 'array' THEN v_payment.applied_invoices ELSE '[]'::jsonb END
        ) LOOP
            SELECT * INTO v_inv_record FROM docs_invoices WHERE id = (v_alloc->>'invoiceId') FOR UPDATE;
            IF FOUND THEN
                SELECT COALESCE(SUM((al->>'amount')::numeric), 0) INTO v_new_amt_paid
                FROM docs_payments p, jsonb_array_elements(
                    CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices ELSE '[]'::jsonb END
                ) al
                WHERE p.status = 'POSTED' AND p.company_id = v_effective_company_id AND al->>'invoiceId' = v_inv_record.id;
                
                UPDATE docs_invoices 
                SET status = CASE WHEN v_new_amt_paid >= COALESCE(total, 0) - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                    updated_at = NOW()
                WHERE id = v_inv_record.id;
            END IF;
        END LOOP;
    ELSIF NOT v_is_receipt AND v_payment.applied_bills IS NOT NULL THEN
        FOR v_alloc IN SELECT * FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(v_payment.applied_bills) = 'array' THEN v_payment.applied_bills ELSE '[]'::jsonb END
        ) LOOP
            SELECT * INTO v_bill_record FROM docs_bills WHERE id = (v_alloc->>'billId') FOR UPDATE;
            IF FOUND THEN
                SELECT COALESCE(SUM((al->>'amount')::numeric), 0) INTO v_new_amt_paid
                FROM docs_payments p, jsonb_array_elements(
                    CASE WHEN jsonb_typeof(p.applied_bills) = 'array' THEN p.applied_bills ELSE '[]'::jsonb END
                ) al
                WHERE p.status = 'POSTED' AND p.company_id = v_effective_company_id AND al->>'billId' = v_bill_record.id;

                UPDATE docs_bills 
                SET status = CASE WHEN v_new_amt_paid >= COALESCE(total, 0) - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                    updated_at = NOW()
                WHERE id = v_bill_record.id;
            END IF;
        END LOOP;
    END IF;

    UPDATE docs_journals 
    SET data = jsonb_build_object(
        'id', id,
        'date', date,
        'status', status,
        'companyId', company_id,
        'reference', reference_number,
        'journalType', CASE WHEN journal_type = 'CUST_PAY' THEN 'CUST_PAY' ELSE 'VEND_PAY' END,
        'lines', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', id, 
                'accountId', account_id, 
                'debit', debit, 
                'credit', credit, 
                'description', description, 
                'contactId', contact_id
            )) FROM docs_journal_lines WHERE journal_id = v_journal_id AND (debit != 0 OR credit != 0)
        ), '[]'::jsonb)
    )
    WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
