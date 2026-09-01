-- advanced_rpcs.sql

CREATE OR REPLACE FUNCTION post_payment(p_payment_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_payment RECORD;
    v_journal_id TEXT;
    v_is_receipt BOOLEAN;
    v_is_refund BOOLEAN;
    v_is_payment BOOLEAN;
    v_amount NUMERIC;
    v_liquidity_acc TEXT;
    v_partner_acc TEXT;
    v_effective_company_id TEXT;
    v_unapplied_amt NUMERIC;
    v_allocs JSONB := '[]'::jsonb;
    v_alloc JSONB;
    v_open_doc RECORD;
    v_amount_to_apply NUMERIC;
BEGIN
    SELECT * INTO v_payment FROM docs_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payment not found'); END IF;
    
    v_journal_id := COALESCE(v_payment.data->>'journalEntryId', 'JE-' || replace(UPPER(v_payment.id), 'PAY-', ''));
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted'); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_payment.company_id, v_payment.data->>'companyId');
    v_is_receipt := (v_payment.data->>'type') IN ('RECEIPT', 'COLLECTION');
    v_is_refund := (v_payment.data->>'type') = 'REFUND';
    v_is_payment := (v_payment.data->>'type') = 'PAYMENT';
    v_amount := (v_payment.data->>'amount')::numeric;

    -- Account resolution skipped for brevity (keep existing logic from previous)
    SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE id = v_payment.data->>'accountId' AND company_id = v_effective_company_id;
    IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN ('1011', '100100', '100101') AND company_id = v_effective_company_id LIMIT 1;
    END IF;
    
    SELECT id INTO v_partner_acc FROM docs_accounts WHERE id = v_payment.data->>'partnerAccountId' AND company_id = v_effective_company_id;
    IF v_partner_acc IS NULL THEN
        SELECT id INTO v_partner_acc FROM docs_accounts WHERE code IN ('100201', '200101') AND company_id = v_effective_company_id 
        ORDER BY CASE WHEN v_is_receipt OR v_is_refund THEN (code = '100201') ELSE (code = '200101') END DESC LIMIT 1;
    END IF;

    -- Auto Allocations Logic
    v_unapplied_amt := v_amount;
    
    -- If there's already applied invoices, deduct those
    IF (v_payment.data ? 'appliedInvoices') THEN
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedInvoices') = 'array' THEN v_payment.data->'appliedInvoices' ELSE '[]'::jsonb END) LOOP
            v_unapplied_amt := v_unapplied_amt - (v_alloc->>'amount')::numeric;
        END LOOP;
        v_allocs := COALESCE(v_payment.data->'appliedInvoices', '[]'::jsonb);
    ELSIF (v_payment.data ? 'appliedBills') THEN
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedBills') = 'array' THEN v_payment.data->'appliedBills' ELSE '[]'::jsonb END) LOOP
            v_unapplied_amt := v_unapplied_amt - (v_alloc->>'amount')::numeric;
        END LOOP;
        v_allocs := COALESCE(v_payment.data->'appliedBills', '[]'::jsonb);
    END IF;

    -- Auto-apply remaining to open invoices or bills
    IF v_unapplied_amt > 0 AND v_payment.contact_id IS NOT NULL THEN
        IF v_is_receipt OR (v_payment.data->>'method' = 'ADVANCE') THEN
            FOR v_open_doc IN 
                SELECT id, (data->>'total')::numeric - COALESCE((data->>'amountPaid')::numeric, 0) as due, data->>'number' as num
                FROM docs_invoices 
                WHERE company_id = v_effective_company_id AND customer_id = v_payment.contact_id 
                AND status IN ('POSTED', 'PARTIAL') 
                ORDER BY date ASC
            LOOP
                IF v_unapplied_amt <= 0 THEN EXIT; END IF;
                IF v_open_doc.due > 0 THEN
                    v_amount_to_apply := LEAST(v_unapplied_amt, v_open_doc.due);
                    v_allocs := v_allocs || jsonb_build_object(
                        'invoiceId', v_open_doc.id, 'invoiceNumber', v_open_doc.num,
                        'amount', v_amount_to_apply, 'remaining', v_open_doc.due - v_amount_to_apply
                    );
                    v_unapplied_amt := v_unapplied_amt - v_amount_to_apply;
                END IF;
            END LOOP;
            v_payment.data := jsonb_set(v_payment.data, '{appliedInvoices}', v_allocs);
        ELSIF v_is_payment THEN
            FOR v_open_doc IN 
                SELECT id, (data->>'total')::numeric - COALESCE((data->>'amountPaid')::numeric, 0) as due, COALESCE(data->>'reference', data->>'number', id) as num
                FROM docs_bills 
                WHERE company_id = v_effective_company_id AND vendor_id = v_payment.contact_id 
                AND status IN ('POSTED', 'PARTIAL') 
                ORDER BY date ASC
            LOOP
                IF v_unapplied_amt <= 0 THEN EXIT; END IF;
                IF v_open_doc.due > 0 THEN
                    v_amount_to_apply := LEAST(v_unapplied_amt, v_open_doc.due);
                    v_allocs := v_allocs || jsonb_build_object(
                        'billId', v_open_doc.id, 'billNumber', v_open_doc.num,
                        'amount', v_amount_to_apply, 'remaining', v_open_doc.due - v_amount_to_apply
                    );
                    v_unapplied_amt := v_unapplied_amt - v_amount_to_apply;
                END IF;
            END LOOP;
            v_payment.data := jsonb_set(v_payment.data, '{appliedBills}', v_allocs);
        END IF;
    END IF;

    -- Update Invoice/Bill amounts based on v_allocs
    IF v_is_receipt OR (v_payment.data->>'method' = 'ADVANCE') THEN
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedInvoices') = 'array' THEN v_payment.data->'appliedInvoices' ELSE '[]'::jsonb END) LOOP
            UPDATE docs_invoices 
            SET data = jsonb_set(
                jsonb_set(data, '{amountPaid}', to_jsonb(COALESCE((data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric)),
                '{status}', 
                CASE WHEN COALESCE((data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric >= (data->>'total')::numeric - 0.01 THEN '"PAID"' ELSE '"PARTIAL"' END::jsonb
            ),
            status = CASE WHEN COALESCE((data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric >= (data->>'total')::numeric - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
            updated_at = NOW()
            WHERE id = (v_alloc->>'invoiceId');
        END LOOP;
    ELSIF v_is_payment THEN
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedBills') = 'array' THEN v_payment.data->'appliedBills' ELSE '[]'::jsonb END) LOOP
            UPDATE docs_bills 
            SET data = jsonb_set(
                jsonb_set(data, '{amountPaid}', to_jsonb(COALESCE((data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric)),
                '{status}', 
                CASE WHEN COALESCE((data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric >= (data->>'total')::numeric - 0.01 THEN '"PAID"' ELSE '"PARTIAL"' END::jsonb
            ),
            status = CASE WHEN COALESCE((data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric >= (data->>'total')::numeric - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
            updated_at = NOW()
            WHERE id = (v_alloc->>'billId');
        END LOOP;
    END IF;

    -- Generate Journal lines
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_payment.date, CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END, 'POSTED', COALESCE(v_payment.data->>'reference', v_payment.id), 
        jsonb_build_object('id', v_journal_id, 'date', v_payment.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', COALESCE(v_payment.data->>'reference', v_payment.id), 'journalType', CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', data = EXCLUDED.data;

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    IF v_is_receipt THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES ('JL-'||v_journal_id||'-1', v_journal_id, v_effective_company_id, v_liquidity_acc, v_payment.contact_id, v_amount, 0, 'Collection');
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES ('JL-'||v_journal_id||'-2', v_journal_id, v_effective_company_id, v_partner_acc, v_payment.contact_id, 0, v_amount, 'From Customer');
    ELSIF v_is_payment THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES ('JL-'||v_journal_id||'-1', v_journal_id, v_effective_company_id, v_partner_acc, v_payment.contact_id, v_amount, 0, 'Vendor Payment');
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description) VALUES ('JL-'||v_journal_id||'-2', v_journal_id, v_effective_company_id, v_liquidity_acc, v_payment.contact_id, 0, v_amount, 'Via Liquid');
    END IF;

    UPDATE docs_payments SET status = 'POSTED', data = jsonb_set(jsonb_set(v_payment.data, '{status}', '"POSTED"'), '{journalEntryId}', to_jsonb(v_journal_id)), updated_at = NOW() WHERE id = p_payment_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
