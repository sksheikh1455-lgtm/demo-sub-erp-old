CREATE OR REPLACE FUNCTION register_batch_payment(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_contact_id TEXT;
    v_amount NUMERIC;
    v_payment_type TEXT;
    v_is_customer BOOLEAN;
    v_company_id TEXT;
    v_user_id TEXT;
    
    v_docs_to_pay JSONB := '[]'::jsonb;
    v_unallocated_advances JSONB := '[]'::jsonb;
    
    v_doc_json JSONB;
    v_adv RECORD;
    
    v_remaining_amount NUMERIC;
    v_doc_unpaid NUMERIC;
    v_allocate NUMERIC;
    
    v_allocations_for_new JSONB := '[]'::jsonb;
    v_advance_updates JSONB := '{}'::jsonb;
    v_adv_allocs JSONB;
    v_new_adv_allocs JSONB;
    
    v_new_payment_id TEXT;
    v_new_payment_amt NUMERIC := 0;
    
    v_res RECORD;
BEGIN
    v_contact_id := payload->>'contactId';
    v_amount := (payload->>'amount')::NUMERIC;
    v_company_id := payload->>'companyId';
    v_user_id := COALESCE(payload->>'createdById', 'user-1');
    v_payment_type := CASE WHEN (payload ? 'invoiceIds') THEN 'RECEIPT' ELSE 'PAYMENT' END;
    v_is_customer := v_payment_type = 'RECEIPT';
    
    v_remaining_amount := v_amount;
    
    -- 1. Gather docs to pay
    IF v_is_customer THEN
        IF payload ? 'invoiceIds' AND jsonb_array_length(payload->'invoiceIds') > 0 THEN
            SELECT jsonb_agg(row_to_json(i) ORDER BY date ASC) INTO v_docs_to_pay
            FROM docs_invoices i
            WHERE i.id IN (SELECT jsonb_array_elements_text(payload->'invoiceIds'))
              AND i.status IN ('POSTED', 'PARTIAL', 'PARTIAL_REFUNDED')
              AND i.company_id = v_company_id;
        ELSE
            SELECT jsonb_agg(row_to_json(i) ORDER BY date ASC) INTO v_docs_to_pay
            FROM docs_invoices i
            WHERE i.customer_id = v_contact_id
              AND i.status IN ('POSTED', 'PARTIAL', 'PARTIAL_REFUNDED')
              AND i.company_id = v_company_id;
        END IF;
    ELSE
        IF payload ? 'billIds' AND jsonb_array_length(payload->'billIds') > 0 THEN
            SELECT jsonb_agg(row_to_json(b) ORDER BY date ASC) INTO v_docs_to_pay
            FROM docs_bills b
            WHERE b.id IN (SELECT jsonb_array_elements_text(payload->'billIds'))
              AND b.status IN ('POSTED', 'PARTIAL')
              AND b.company_id = v_company_id;
        ELSE
            SELECT jsonb_agg(row_to_json(b) ORDER BY date ASC) INTO v_docs_to_pay
            FROM docs_bills b
            WHERE b.vendor_id = v_contact_id
              AND b.status IN ('POSTED', 'PARTIAL')
              AND b.company_id = v_company_id;
        END IF;
    END IF;
    
    v_docs_to_pay := COALESCE(v_docs_to_pay, '[]'::jsonb);

    CREATE TEMP TABLE tmp_advances ON COMMIT DROP AS
    SELECT p.id, p.amount, 
           CASE WHEN v_is_customer THEN p.applied_invoices ELSE p.applied_bills END as applied,
           (p.amount - (
              SELECT COALESCE(SUM((al->>'amount')::NUMERIC), 0)
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(CASE WHEN v_is_customer THEN p.applied_invoices ELSE p.applied_bills END) = 'array' THEN (CASE WHEN v_is_customer THEN p.applied_invoices ELSE p.applied_bills END) ELSE '[]'::jsonb END) al
           )) as unallocated
    FROM docs_payments p
    WHERE p.status = 'POSTED' AND p.type = v_payment_type AND p.contact_id = v_contact_id AND p.company_id = v_company_id;
    
    FOR v_doc_json IN SELECT * FROM jsonb_array_elements(v_docs_to_pay) LOOP
        -- calculate unpaid
        IF v_is_customer THEN
            SELECT (v_doc_json->>'total')::NUMERIC - COALESCE(SUM((al->>'amount')::numeric), 0) INTO v_doc_unpaid
            FROM docs_payments p, jsonb_array_elements(
                CASE WHEN jsonb_typeof(p.applied_invoices) = 'array' THEN p.applied_invoices ELSE '[]'::jsonb END
            ) al
            WHERE p.status = 'POSTED' AND p.company_id = v_company_id AND al->>'invoiceId' = (v_doc_json->>'id');
        ELSE
            SELECT (v_doc_json->>'total')::NUMERIC - COALESCE(SUM((al->>'amount')::numeric), 0) INTO v_doc_unpaid
            FROM docs_payments p, jsonb_array_elements(
                CASE WHEN jsonb_typeof(p.applied_bills) = 'array' THEN p.applied_bills ELSE '[]'::jsonb END
            ) al
            WHERE p.status = 'POSTED' AND p.company_id = v_company_id AND al->>'billId' = (v_doc_json->>'id');
        END IF;
        v_doc_unpaid := COALESCE(v_doc_unpaid, (v_doc_json->>'total')::NUMERIC);
        
        -- Allocate advances first
        FOR v_adv IN SELECT * FROM tmp_advances WHERE unallocated > 0 ORDER BY id ASC LOOP
            IF v_doc_unpaid > 0 THEN
                v_allocate := LEAST(v_doc_unpaid, v_adv.unallocated);
                
                v_adv_allocs := COALESCE(v_advance_updates->v_adv.id, CASE WHEN jsonb_typeof(v_adv.applied) = 'array' THEN v_adv.applied ELSE '[]'::jsonb END);
                IF v_is_customer THEN
                    v_new_adv_allocs := v_adv_allocs || jsonb_build_object('invoiceId', v_doc_json->>'id', 'invoiceNumber', v_doc_json->>'number', 'amount', v_allocate);
                ELSE
                    v_new_adv_allocs := v_adv_allocs || jsonb_build_object('billId', v_doc_json->>'id', 'billNumber', v_doc_json->>'number', 'amount', v_allocate);
                END IF;
                v_advance_updates := jsonb_set(v_advance_updates, ARRAY[v_adv.id], v_new_adv_allocs);
                
                UPDATE tmp_advances SET unallocated = unallocated - v_allocate WHERE id = v_adv.id;
                v_doc_unpaid := v_doc_unpaid - v_allocate;
            END IF;
        END LOOP;
        
        -- Allocate new amount
        IF v_doc_unpaid > 0 AND v_remaining_amount > 0 THEN
            v_allocate := LEAST(v_doc_unpaid, v_remaining_amount);
            IF v_is_customer THEN
                v_allocations_for_new := v_allocations_for_new || jsonb_build_object('invoiceId', v_doc_json->>'id', 'invoiceNumber', v_doc_json->>'number', 'amount', v_allocate, 'remaining', v_doc_unpaid - v_allocate);
            ELSE
                v_allocations_for_new := v_allocations_for_new || jsonb_build_object('billId', v_doc_json->>'id', 'billNumber', v_doc_json->>'number', 'amount', v_allocate, 'remaining', v_doc_unpaid - v_allocate);
            END IF;
            v_remaining_amount := v_remaining_amount - v_allocate;
            v_new_payment_amt := v_new_payment_amt + v_allocate;
        END IF;
    END LOOP;
    
    -- 4. Execute Advance Payments updates
    FOR v_adv IN SELECT key, value FROM jsonb_each(v_advance_updates) LOOP
        IF v_is_customer THEN
            UPDATE docs_payments SET applied_invoices = v_adv.value WHERE id = v_adv.key;
        ELSE
            UPDATE docs_payments SET applied_bills = v_adv.value WHERE id = v_adv.key;
        END IF;
        PERFORM post_payment(v_adv.key, v_company_id);
    END LOOP;
    
    -- 5. Create new payment
    IF v_new_payment_amt > 0 OR (v_amount > 0 AND jsonb_array_length(v_allocations_for_new) = 0 AND (SELECT count(*) FROM jsonb_each(v_advance_updates)) = 0) THEN
        v_new_payment_id := 'PAY-' || gen_random_uuid();
        
        INSERT INTO docs_payments (
            id, company_id, status, type, amount, date, payment_date, contact_id, method, reference, account_id, payment_category, applied_invoices, applied_bills
        ) VALUES (
            v_new_payment_id, v_company_id, 'DRAFT', v_payment_type, 
            CASE WHEN v_new_payment_amt > 0 THEN v_new_payment_amt ELSE v_amount END,
            (payload->>'date')::DATE, (payload->>'date')::DATE, v_contact_id,
            payload->>'method', payload->>'reference', payload->>'accountId', payload->>'paymentCategory',
            CASE WHEN v_is_customer THEN v_allocations_for_new ELSE '[]'::jsonb END,
            CASE WHEN NOT v_is_customer THEN v_allocations_for_new ELSE '[]'::jsonb END
        );
        
        PERFORM post_payment(v_new_payment_id, v_company_id);
    END IF;
    
    RETURN jsonb_build_object('success', true, 'payment_id', v_new_payment_id);
END;
$$;
