CREATE OR REPLACE FUNCTION post_invoice(p_invoice_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_journal_id TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_idx INTEGER := 0;
    v_is_cash_sale BOOLEAN;
    v_liquidity_acc TEXT;
    v_pay_id TEXT;
    v_effective_company_id TEXT;
    
    v_ar_acc TEXT;
    v_rev_acc TEXT;
    v_tax_acc TEXT;
    v_inv_acc TEXT;
    v_cogs_acc TEXT;
    
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_product_record RECORD;
    v_cogs_value NUMERIC;
    v_item_subtotal NUMERIC;
    v_tax_total NUMERIC;

    v_global_discount NUMERIC := 0;
    v_total_revenue_subtotal NUMERIC := 0;
    v_proportional_discount NUMERIC := 0;
    v_revenue_net NUMERIC := 0;
    v_discount_distributed NUMERIC := 0;
    v_items_count INTEGER := 0;
    v_current_item_idx INTEGER := 0;
    
    v_prepared_by TEXT;
    v_created_by_id TEXT;
BEGIN
    SELECT * INTO v_invoice FROM docs_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Invoice not found: ' || p_invoice_id); END IF;
    
    v_effective_company_id := COALESCE(p_company_id, v_invoice.company_id);
    v_journal_id := 'JE-INV-' || replace(replace(UPPER(v_invoice.id), 'INV-', ''), 'INV-', '');
    
    -- Prevent duplicate post
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        UPDATE docs_invoices SET status = 'POSTED', updated_at = NOW() WHERE id = p_invoice_id;
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    IF v_effective_company_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Company ID missing'); END IF;

    -- Setup Accounts
    SELECT id INTO v_ar_acc FROM docs_accounts WHERE code = '100201' AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_rev_acc FROM docs_accounts WHERE code = '400100' AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200201' AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100400' AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code = '500100' AND company_id = v_effective_company_id LIMIT 1;
    
    IF v_ar_acc IS NULL OR v_rev_acc IS NULL OR v_tax_acc IS NULL OR v_inv_acc IS NULL OR v_cogs_acc IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Required standard accounts missing for Company: ' || v_effective_company_id);
    END IF;
    
    v_prepared_by := COALESCE(v_invoice.data->>'preparedBy', v_invoice.data->>'salesperson', 'System');
    v_created_by_id := NULLIF(TRIM(v_invoice.data->>'createdById'), '');
    IF v_created_by_id IS NULL THEN
        v_created_by_id := NULLIF(TRIM(v_invoice.data->>'authorId'), '');
    END IF;

    -- Upsert Draft Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_invoice.date, 'INV', 'DRAFT', v_invoice.data->>'number', v_invoice.data->>'number', v_prepared_by, v_created_by_id, NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW(), prepared_by = v_prepared_by, created_by_id = v_created_by_id;

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- Check for global discount
    FOR v_item IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' = 'DISCOUNT' THEN
            v_global_discount := v_global_discount + ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
        ELSIF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
            v_total_revenue_subtotal := v_total_revenue_subtotal + ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
        END IF;
    END LOOP;

    SELECT count(*) INTO v_items_count FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) it WHERE it->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE');

    -- AR Line (Header Total)
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, v_ar_acc, v_invoice.customer_id, COALESCE(v_invoice.total, (v_invoice.data->>'total')::numeric, 0), 0, 'Receivable: ' || (v_invoice.data->>'number'));
    v_total_debit := v_total_debit + COALESCE(v_invoice.total, (v_invoice.data->>'total')::numeric, 0);

    -- Loop Lines
    BEGIN
        FOR v_item IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) LOOP
            v_idx := v_idx + 1;
            
            IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_current_item_idx := v_current_item_idx + 1;
                v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                
                IF v_item_subtotal = 0 THEN
                    CONTINUE;
                END IF;
                
                -- Distribution Logic (v_global_discount is negative)
                IF v_current_item_idx = v_items_count THEN
                    v_proportional_discount := ROUND(v_global_discount - v_discount_distributed, 2);
                ELSE
                    v_proportional_discount := CASE WHEN v_total_revenue_subtotal > 0 THEN (v_item_subtotal / v_total_revenue_subtotal) * v_global_discount ELSE 0 END;
                    v_proportional_discount := ROUND(v_proportional_discount, 2);
                    v_discount_distributed := v_discount_distributed + v_proportional_discount;
                END IF;

                v_revenue_net := ROUND(v_item_subtotal + v_proportional_discount, 2);

                -- Revenue Cr
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-rev-' || v_idx, v_journal_id, v_effective_company_id, v_rev_acc, 0, v_revenue_net, 'Revenue: ' || (v_item->>'description'));
                v_total_credit := v_total_credit + v_revenue_net;

                IF v_item->>'type' = 'PRODUCT' THEN
                    SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
                    IF FOUND THEN
                        v_current_stock := COALESCE((v_product_record.data->'stockLevels'->>v_effective_company_id)::numeric, 0);
                        v_new_stock := v_current_stock - COALESCE((v_item->>'quantity')::numeric, 0);

                        UPDATE docs_products 
                        SET data = jsonb_set(
                            jsonb_set(
                                CASE WHEN data ? 'stockLevels' THEN data ELSE data || '{"stockLevels": {}}'::jsonb END,
                                ARRAY['stockLevels', v_effective_company_id], 
                                v_new_stock::text::jsonb
                            ),
                            '{quantityOnHand}', v_new_stock::text::jsonb
                        ),
                            updated_at = NOW()
                        WHERE id = v_product_record.id;

                        v_cogs_value := ROUND(COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_product_record.data->>'costPrice')::numeric, 0), 2);
                        IF v_cogs_value > 0 THEN
                            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                            VALUES ('JL-' || v_journal_id || '-cogs-' || v_idx, v_journal_id, v_effective_company_id, v_cogs_acc, v_cogs_value, 0, 'COGS: ' || (v_item->>'description'));
                            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                            VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_acc, 0, v_cogs_value, 'Inv Red: ' || (v_item->>'description'));
                            v_total_debit := v_total_debit + v_cogs_value;
                            v_total_credit := v_total_credit + v_cogs_value;
                        END IF;
                    END IF;
                END IF;
            ELSIF v_item->>'type' = 'TAX' THEN
                v_tax_total := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-' || v_idx, v_journal_id, v_effective_company_id, v_tax_acc, 0, v_tax_total, 'Tax: ' || (v_item->>'description'));
                v_total_credit := v_total_credit + v_tax_total;
            END IF;
        END LOOP;
    END;

    -- 5. Balancing & Finalize
    v_total_debit := ROUND(v_total_debit, 2);
    v_total_credit := ROUND(v_total_credit, 2);
    IF v_total_debit != v_total_credit THEN
        IF ABS(v_total_debit - v_total_credit) <= 0.10 THEN
            -- Adjust the last revenue line to balance
            UPDATE docs_journal_lines SET credit = credit + (v_total_debit - v_total_credit)
            WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-rev-' || v_idx;
            v_total_credit := v_total_debit;
        ELSE
            RAISE EXCEPTION 'Invoice Failed: Unbalanced Invoice (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
        END IF;
    END IF;

    -- Upsert Journal Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at)
    VALUES (
      v_journal_id, 
      v_effective_company_id, 
      v_invoice.date, 
      'INV', 
      'POSTED', 
      v_invoice.data->>'number', 
      v_invoice.data->>'number',
      v_prepared_by,
      v_created_by_id,
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET 
      updated_at = NOW(), 
      status = 'POSTED', 
      reference_number = v_invoice.data->>'number',
      reference = v_invoice.data->>'number',
      prepared_by = v_prepared_by,
      created_by_id = v_created_by_id;

    UPDATE docs_journals SET data = jsonb_build_object(
        'id', id, 'date', date, 'status', status, 'companyId', company_id, 'reference', reference, 'journalType', 'INV', 'preparedBy', prepared_by, 'createdById', created_by_id,
        'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id), '[]'::jsonb)
    ) WHERE id = v_journal_id;

    -- Cash Sale Auto Payment Logic (when first posted)
    v_is_cash_sale := COALESCE(v_invoice.customer_id, '') ILIKE '%cash-sale%';
    IF v_is_cash_sale THEN
        -- Find liquidity
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN ('1011', '100100', '100101', 'CASH', 'BANK') AND company_id = v_effective_company_id LIMIT 1;
        IF v_liquidity_acc IS NULL THEN 
            SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE (name ILIKE '%cash%' OR name ILIKE '%bank%') AND company_id = v_effective_company_id LIMIT 1; 
        END IF;
        IF v_liquidity_acc IS NULL THEN 
            SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE type = 'ASSET' AND company_id = v_effective_company_id LIMIT 1; 
        END IF;
        
        v_pay_id := 'PAY-AUTO-' || p_invoice_id;
        INSERT INTO docs_payments (id, company_id, date, contact_id, status, type, amount, payment_date, applied_invoices, data, updated_at)
        VALUES (
            v_pay_id, v_effective_company_id, v_invoice.date, v_invoice.customer_id, 'DRAFT', 'RECEIPT', COALESCE(v_invoice.total, (v_invoice.data->>'total')::numeric, 0), v_invoice.date,
            jsonb_build_array(jsonb_build_object('invoiceId', p_invoice_id, 'invoiceNumber', COALESCE(v_invoice.invoice_number, v_invoice.data->>'number'), 'amount', COALESCE(v_invoice.total, (v_invoice.data->>'total')::numeric, 0), 'remaining', 0)),
            jsonb_build_object(
                'id', v_pay_id, 'amount', COALESCE(v_invoice.total, (v_invoice.data->>'total')::numeric, 0),
                'contactId', v_invoice.customer_id, 'date', v_invoice.date, 'method', 'CASH', 'type', 'RECEIPT',
                'accountId', v_liquidity_acc, 'status', 'DRAFT', 'companyId', v_effective_company_id,
                'appliedInvoices', jsonb_build_array(jsonb_build_object('invoiceId', p_invoice_id, 'invoiceNumber', COALESCE(v_invoice.invoice_number, v_invoice.data->>'number'), 'amount', COALESCE(v_invoice.total, (v_invoice.data->>'total')::numeric, 0), 'remaining', 0)),
                'createdById', v_created_by_id,
                'preparedBy', v_prepared_by
            ),
            NOW()
        ) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, date = EXCLUDED.date, payment_date = EXCLUDED.payment_date, amount = EXCLUDED.amount, type = EXCLUDED.type, applied_invoices = EXCLUDED.applied_invoices, updated_at = NOW();
        
        PERFORM post_payment(v_pay_id, v_effective_company_id);
        
        -- Make sure the invoice is marked as PAID in docs_invoices as well
        UPDATE docs_invoices SET status = 'PAID', data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"PAID"') WHERE id = p_invoice_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;
