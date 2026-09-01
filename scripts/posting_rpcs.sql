
-- Post Invoice Transactional RPC
CREATE OR REPLACE FUNCTION post_invoice(p_invoice_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_journal_id TEXT;
    v_journal_data JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_product_record RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_item_subtotal NUMERIC := 0;
    v_revenue_net NUMERIC := 0;
    v_global_discount NUMERIC := 0;
    v_total_revenue_subtotal NUMERIC := 0;
    v_proportional_discount NUMERIC := 0;
    v_cogs_value NUMERIC := 0;
    v_ar_acc TEXT;
    v_rev_acc TEXT;
    v_cogs_acc TEXT;
    v_inv_acc TEXT;
    v_tax_acc TEXT;
    v_tax_total NUMERIC := 0;
    v_idx INT := 0;
    v_tracking_type TEXT;
    v_effective_company_id TEXT;
BEGIN
    -- 1. Get Invoice Data with Lock
    SELECT * INTO v_invoice FROM docs_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;
    v_journal_id := COALESCE(v_invoice.data->>'journalEntryId', 'JE-' || replace(UPPER(v_invoice.id), 'INV-', ''));
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_invoice.company_id, v_invoice.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

    -- 2. Resolve Accounts
    SELECT id INTO v_ar_acc FROM docs_accounts WHERE code IN ('100201', '100200') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_rev_acc FROM docs_accounts WHERE code IN ('400100', '400000') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code = '500101' AND company_id = v_effective_company_id;
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_effective_company_id;
    SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200400' AND company_id = v_effective_company_id;

    IF v_ar_acc IS NULL OR v_rev_acc IS NULL THEN 
       RAISE EXCEPTION 'Required AR/Revenue accounts not found for company %', v_effective_company_id;
    END IF;

    -- 3. Calculate Global Totals for Proportional Distribution & Balancing
    v_total_revenue_subtotal := 0;
    v_global_discount := 0;
    v_tax_total := 0;
    
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
            v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_item_subtotal = 0 THEN
                v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                ELSE
                    v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                END IF;
                v_item_subtotal := ROUND(v_item_subtotal, 2);
            END IF;
            v_total_revenue_subtotal := v_total_revenue_subtotal + v_item_subtotal;
        ELSIF v_item->>'type' = 'DISCOUNT' THEN
            v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_item_subtotal = 0 THEN
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_item_subtotal := -ROUND(COALESCE((v_item->>'discountRate')::numeric, 0), 2);
                ELSE
                    v_item_subtotal := -ROUND(v_total_revenue_subtotal * COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0, 2);
                END IF;
            END IF;
            v_global_discount := v_global_discount + v_item_subtotal;
        ELSIF v_item->>'type' = 'TAX' THEN
            v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_item_subtotal = 0 THEN
               v_item_subtotal := COALESCE((v_item->>'manualValue')::numeric, ROUND((v_total_revenue_subtotal + v_global_discount) * (COALESCE((v_item->>'taxRate')::numeric, 0)/100.0), 2));
            END IF;
            v_tax_total := v_tax_total + v_item_subtotal;
        END IF;
    END LOOP;

    -- 4. Finalize Invoice Status First (to generate number)
    v_journal_id := COALESCE(v_invoice.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_invoice.id), 'INV-', ''), 'INV-', ''));
    UPDATE docs_invoices SET status = 'POSTED', data = jsonb_set(jsonb_set(data, '{status}', '"POSTED"'), '{journalEntryId}', to_jsonb(v_journal_id)), updated_at = NOW() WHERE id = p_invoice_id RETURNING * INTO v_invoice;

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    SELECT id INTO v_journal_id FROM docs_journals WHERE company_id = v_effective_company_id AND reference_number = v_invoice.data->>'number' LIMIT 1;
    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_invoice.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_invoice.id), 'INV-', ''), 'INV-', ''));
    END IF;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    -- But only if it's not already POSTED
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_invoice.date, 'INV', 'DRAFT', v_invoice.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_invoice.date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', v_invoice.data->>'number', 'journalType', 'INV'), NOW())
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- AR Line (Total)
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, v_ar_acc, v_invoice.customer_id, ROUND(COALESCE((v_invoice.data->>'total')::numeric, 0), 2), 0, 'AR: ' || (v_invoice.data->>'number'));
    v_total_debit := ROUND(COALESCE((v_invoice.data->>'total')::numeric, 0), 2);

    -- Items
    DECLARE
        v_discount_distributed NUMERIC := 0;
        v_items_count INT := 0;
        v_current_item_idx INT := 0;
    BEGIN
        SELECT count(*) INTO v_items_count FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) it WHERE it->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE');

        FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) LOOP
            v_idx := v_idx + 1; -- Unique for every item in raw array
            
            IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_current_item_idx := v_current_item_idx + 1;
                
                -- Calculate Gross for this line
                v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                IF v_item_subtotal = 0 THEN
                    v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                    IF v_item->>'discountMode' = 'FIXED' THEN
                        v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                    ELSE
                        v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                    END IF;
                    v_item_subtotal := ROUND(v_item_subtotal, 2);
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
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_invoice.date, 'INV', 'POSTED', v_invoice.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_invoice.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_invoice.data->>'number', 'journalType', 'INV', 'preparedBy', COALESCE(v_invoice.data->>'preparedBy', v_invoice.data->>'salesperson'), 'createdById', v_invoice.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', data = EXCLUDED.data;

    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Post Bill RPC
CREATE OR REPLACE FUNCTION post_bill(p_bill_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_bill RECORD;
    v_item JSONB;
    v_journal_id TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_product_record RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_old_cost NUMERIC;
    v_new_cost NUMERIC;
    v_idx INT := 0;
    v_ap_acc TEXT;
    v_inv_acc TEXT;
    v_exp_acc TEXT;
    v_tax_acc TEXT;
    v_net_cost NUMERIC := 0;
    v_total_revenue_subtotal NUMERIC := 0;
    v_global_discount NUMERIC := 0;
    v_proportional_discount NUMERIC := 0;
    v_revenue_net NUMERIC := 0;
    v_tax_total NUMERIC := 0;
    v_effective_company_id TEXT;
BEGIN
    -- 1. Get Bill Data
    SELECT * INTO v_bill FROM docs_bills WHERE id = p_bill_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found: %', p_bill_id; END IF;
    v_journal_id := COALESCE(v_bill.data->>'journalEntryId', 'JE-' || replace(UPPER(v_bill.id), 'BILL-', ''));
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_bill.company_id, v_bill.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

    -- 2. Resolve Accounts
    SELECT id INTO v_ap_acc FROM docs_accounts WHERE code IN ('200101', '200100', '200201') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_effective_company_id;
    SELECT id INTO v_exp_acc FROM docs_accounts WHERE code IN ('500101', '600100') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200400' AND company_id = v_effective_company_id;

    IF v_ap_acc IS NULL THEN 
       RAISE EXCEPTION 'Accounts Payable account not found for company %', v_effective_company_id;
    END IF;

    -- 3. Calculate Global Totals for Proportional Distribution & Balancing
    v_total_revenue_subtotal := 0;
    v_global_discount := 0;
    v_tax_total := 0;
    
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_bill.data->'items') = 'array' THEN v_bill.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                v_net_cost := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := v_net_cost - COALESCE((v_item->>'discountRate')::numeric, 0);
                ELSE
                    v_net_cost := v_net_cost * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                END IF;
                v_net_cost := ROUND(v_net_cost, 2);
            END IF;
            v_total_revenue_subtotal := v_total_revenue_subtotal + v_net_cost;
        ELSIF v_item->>'type' = 'DISCOUNT' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := -ROUND(COALESCE((v_item->>'discountRate')::numeric, 0), 2);
                ELSE
                    v_net_cost := -ROUND(v_total_revenue_subtotal * COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0, 2);
                END IF;
            END IF;
            v_global_discount := v_global_discount + v_net_cost;
        ELSIF v_item->>'type' = 'TAX' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
               v_net_cost := COALESCE((v_item->>'manualValue')::numeric, ROUND((v_total_revenue_subtotal + v_global_discount) * (COALESCE((v_item->>'taxRate')::numeric, 0)/100.0), 2));
            END IF;
            v_tax_total := v_tax_total + v_net_cost;
        END IF;
    END LOOP;

    -- 4. Finalize Bill Status First (to generate number)
    v_journal_id := COALESCE(v_bill.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_bill.id), 'BIL-', ''), 'BILL-', ''));
    UPDATE docs_bills SET status = 'POSTED', data = jsonb_set(data, '{status}', '"POSTED"'), updated_at = NOW() WHERE id = p_bill_id RETURNING * INTO v_bill;

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    SELECT id INTO v_journal_id FROM docs_journals WHERE company_id = v_effective_company_id AND reference_number = v_bill.data->>'number' LIMIT 1;
    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_bill.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_bill.id), 'BIL-', ''), 'BILL-', ''));
    END IF;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    -- But only if it's not already POSTED
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_bill.date, 'BILL', 'DRAFT', v_bill.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_bill.date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', v_bill.data->>'number', 'journalType', 'BILL'), NOW())
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- AP Line (Total)
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ap', v_journal_id, v_effective_company_id, v_ap_acc, v_bill.vendor_id, 0, ROUND(COALESCE((v_bill.data->>'total')::numeric, 0), 2), 'AP: ' || (v_bill.data->>'number'));
    v_total_credit := ROUND(COALESCE((v_bill.data->>'total')::numeric, 0), 2);

    -- Items
    DECLARE
        v_discount_distributed NUMERIC := 0;
        v_items_count INT := 0;
        v_current_item_idx INT := 0;
    BEGIN
        SELECT count(*) INTO v_items_count FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_bill.data->'items') = 'array' THEN v_bill.data->'items' ELSE '[]'::jsonb END) it WHERE it->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE');

        FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_bill.data->'items') = 'array' THEN v_bill.data->'items' ELSE '[]'::jsonb END) LOOP
            v_idx := v_idx + 1; -- Unique for every item in raw array
            
            IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_current_item_idx := v_current_item_idx + 1;
                
                -- Calculate Gross for this line
                v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                IF v_net_cost = 0 THEN
                    v_net_cost := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                    IF v_item->>'discountMode' = 'FIXED' THEN
                        v_net_cost := v_net_cost - COALESCE((v_item->>'discountRate')::numeric, 0);
                    ELSE
                        v_net_cost := v_net_cost * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                    END IF;
                    v_net_cost := ROUND(v_net_cost, 2);
                END IF;
                
                -- Distribution Logic (v_global_discount is negative)
                IF v_current_item_idx = v_items_count THEN
                    v_proportional_discount := ROUND(v_global_discount - v_discount_distributed, 2);
                ELSE
                    v_proportional_discount := CASE WHEN v_total_revenue_subtotal > 0 THEN (v_net_cost / v_total_revenue_subtotal) * v_global_discount ELSE 0 END;
                    v_proportional_discount := ROUND(v_proportional_discount, 2);
                    v_discount_distributed := v_discount_distributed + v_proportional_discount;
                END IF;

                v_revenue_net := ROUND(v_net_cost + v_proportional_discount, 2);

                IF v_item->>'type' = 'PRODUCT' THEN
                    -- Dr Inventory
                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_acc, v_revenue_net, 0, 'Inv Val: ' || (v_item->>'description'));
                    v_total_debit := v_total_debit + v_revenue_net;

                    -- Update Stock & WAC (WAC update usually on Bills)
                    SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
                    IF FOUND THEN
                        v_current_stock := COALESCE((v_product_record.data->'stockLevels'->>v_effective_company_id)::numeric, 0);
                        v_new_stock := v_current_stock + COALESCE((v_item->>'quantity')::numeric, 0);
                        
                        UPDATE docs_products 
                        SET data = jsonb_set(
                            jsonb_set(
                                jsonb_set(
                                    CASE WHEN data ? 'stockLevels' THEN data ELSE data || '{"stockLevels": {}}'::jsonb END,
                                    ARRAY['stockLevels', v_effective_company_id], 
                                    v_new_stock::text::jsonb
                                ),
                                '{lastPurchasePrice}', COALESCE((v_item->>'unitPrice')::text, '0')::jsonb
                            ),
                            '{quantityOnHand}', v_new_stock::text::jsonb
                        ) || jsonb_build_object('lastPurchaseRate', COALESCE((v_item->>'unitPrice')::numeric, 0)),
                            updated_at = NOW()
                        WHERE id = v_product_record.id;
                    END IF;
                ELSIF v_item->>'type' IN ('SERVICE', 'CHARGE') THEN
                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-exp-' || v_idx, v_journal_id, v_effective_company_id, v_exp_acc, v_revenue_net, 0, 'Exp: ' || (v_item->>'description'));
                    v_total_debit := v_total_debit + v_revenue_net;
                END IF;
            ELSIF v_item->>'type' = 'TAX' THEN
                v_tax_total := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-' || v_idx, v_journal_id, v_effective_company_id, v_tax_acc, v_tax_total, 0, 'Tax: ' || (v_item->>'description'));
                v_total_debit := v_total_debit + v_tax_total;
            END IF;
        END LOOP;
    END;

    -- If no items / lines were processed or debit is still 0 while credit is > 0,
    -- create a default Sales Return line matching v_cn.subtotal (or total - tax)
    IF v_total_credit > 0 AND v_total_debit = 0 THEN
        DECLARE
            v_net_return NUMERIC;
            v_tax_return NUMERIC;
        BEGIN
            v_tax_return := ROUND(COALESCE((v_cn.data->>'taxTotal')::numeric, v_cn.tax_total, 0), 2);
            v_net_return := ROUND(v_total_credit - v_tax_return, 2);
            
            -- Debit Revenue
            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
            VALUES ('JL-' || v_journal_id || '-rev-fallback', v_journal_id, v_effective_company_id, v_rev_acc, v_net_return, 0, 'Srv Return (Fallback): ' || COALESCE(v_cn.data->>'number', v_cn.credit_note_number));
            v_total_debit := v_total_debit + v_net_return;
            
            -- Debit Tax if any
            IF v_tax_return > 0 THEN
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-fallback', v_journal_id, v_effective_company_id, v_tax_acc, v_tax_return, 0, 'Tax Reverse (Fallback): ' || COALESCE(v_cn.data->>'number', v_cn.credit_note_number));
                v_total_debit := v_total_debit + v_tax_return;
            END IF;
        END;
    END IF;

    -- Balancing
    v_total_debit := ROUND(v_total_debit, 2);
    v_total_credit := ROUND(v_total_credit, 2);
    IF v_total_debit != v_total_credit THEN
        IF ABS(v_total_debit - v_total_credit) <= 0.10 THEN
            -- Adjust the last expense or inventory line to balance
            UPDATE docs_journal_lines SET debit = debit + (v_total_credit - v_total_debit)
            WHERE journal_id = v_journal_id AND (id = 'JL-' || v_journal_id || '-exp-' || v_idx OR id = 'JL-' || v_journal_id || '-inv-' || v_idx);
            v_total_debit := v_total_credit;
        ELSE
            RAISE EXCEPTION 'Bill Failed: Unbalanced Bill (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
        END IF;
    END IF;

    -- Upsert Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_bill.date, 'BILL', 'POSTED', v_bill.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_bill.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_bill.data->>'number', 'journalType', 'BILL', 'preparedBy', COALESCE(v_bill.data->>'preparedBy', v_bill.data->>'purchaser'), 'createdById', v_bill.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', data = EXCLUDED.data;

    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Post Payment RPC
CREATE OR REPLACE FUNCTION post_payment(p_payment_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_payment RECORD;
    v_journal_id TEXT;
    v_is_receipt BOOLEAN;
    v_is_refund BOOLEAN;
    v_amount NUMERIC;
    v_liquidity_acc TEXT;
    v_partner_acc TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_alloc JSONB;
    v_inv_record RECORD;
    v_bill_record RECORD;
    v_new_amt_paid NUMERIC;
    v_effective_company_id TEXT;
    v_date DATE;
    v_contact_id TEXT;
BEGIN
    -- 1. Get Payment
    SELECT * INTO v_payment FROM docs_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payment not found: ' || p_payment_id); END IF;
    v_journal_id := COALESCE(v_payment.data->>'journalEntryId', 'JE-' || replace(UPPER(v_payment.id), 'PAY-', ''));
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_payment.company_id, v_payment.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Company ID missing'); END IF;

    v_is_receipt := (v_payment.data->>'type') = 'RECEIPT' OR (v_payment.data->>'type') = 'COLLECTION';
    v_is_refund := (v_payment.data->>'type') = 'REFUND';
    v_amount := (v_payment.data->>'amount')::numeric;
    
    -- Sync variables (safety fallback)
    v_date := COALESCE(v_payment.date, (v_payment.data->>'date')::DATE);
    v_contact_id := COALESCE(v_payment.contact_id, v_payment.data->>'contactId', v_payment.data->>'customerId', v_payment.data->>'vendorId');

    -- 2. Resolve Accounts (Cash, Bank, AR/AP)
    v_liquidity_acc := v_payment.data->>'accountId';
    IF v_liquidity_acc IS NOT NULL THEN
        -- Verify ID exists
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE id = v_liquidity_acc AND company_id = v_effective_company_id;
        
        -- If not found by ID, try looking it up as a code (common mistake of passing code as ID)
        IF v_liquidity_acc IS NULL THEN
            SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code = (v_payment.data->>'accountId') AND company_id = v_effective_company_id;
        END IF;
    END IF;

    -- Fallback 1: Try common codes
    IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN ('1011', '100100') AND company_id = v_effective_company_id LIMIT 1;
    END IF;

    -- Fallback 2: Try subType CASH
    IF v_liquidity_acc IS NULL THEN
        SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE (data->>'subType' = 'CASH' OR name ILIKE '%Cash%') AND company_id = v_effective_company_id LIMIT 1;
    END IF;

    IF v_liquidity_acc IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Liquidity account (Cash/Bank) not found. Company: ' || v_effective_company_id); 
    END IF;

    v_partner_acc := v_payment.data->>'partnerAccountId';
    IF v_partner_acc IS NOT NULL THEN
        -- Verify ID exists
        SELECT id INTO v_partner_acc FROM docs_accounts WHERE id = v_partner_acc AND company_id = v_effective_company_id;

        -- If not found by ID, try looking it up as a code
        IF v_partner_acc IS NULL THEN
            SELECT id INTO v_partner_acc FROM docs_accounts WHERE code = (v_payment.data->>'partnerAccountId') AND company_id = v_effective_company_id;
        END IF;
    END IF;

    -- Fallback to default if still null
    IF v_partner_acc IS NULL THEN
        SELECT id INTO v_partner_acc FROM docs_accounts WHERE code IN ('100201', '200101') AND company_id = v_effective_company_id 
        ORDER BY CASE WHEN v_is_receipt OR v_is_refund THEN (code = '100201') ELSE (code = '200101') END DESC LIMIT 1;
    END IF;

    IF v_partner_acc IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Partner account (AR/AP) not found. Company: ' || v_effective_company_id); 
    END IF;

    v_journal_id := COALESCE(v_payment.data->>'journalEntryId', 'JE-' || CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', ''));
    
    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    -- The reference for payment is usually the reference/number/id
    SELECT id INTO v_journal_id FROM docs_journals 
    WHERE company_id = v_effective_company_id 
      AND reference_number = COALESCE(v_payment.data->>'number', v_payment.id) 
    LIMIT 1;
    
    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_payment.data->>'journalEntryId', 'JE-' || CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', ''));
    END IF;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_date, CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 'DRAFT', COALESCE(v_payment.data->>'number', v_payment.id), 
        jsonb_build_object('id', v_journal_id, 'date', v_date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', COALESCE(v_payment.data->>'number', v_payment.id), 'journalType', CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    -- Liquidity Line
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-liq', v_journal_id, v_effective_company_id, v_liquidity_acc, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, COALESCE('Payment: ' || (v_payment.data->>'reference'), 'Payment: ' || (v_payment.data->>'number'), 'Payment: ' || v_payment.id));
    
    -- Partner Line
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-part', v_journal_id, v_effective_company_id, v_partner_acc, v_contact_id, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, COALESCE('Reconciliation: ' || (v_payment.data->>'reference'), 'Reconciliation: ' || (v_payment.data->>'number'), 'Payment reconciliation: ' || v_payment.id));

    -- Upsert Journal Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_date, CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 'POSTED', COALESCE(v_payment.data->>'number', v_payment.id), 
        jsonb_build_object('id', v_journal_id, 'date', v_date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', COALESCE(v_payment.data->>'number', v_payment.id), 'journalType', CASE WHEN v_is_receipt OR v_is_refund THEN 'CUST_PAY' ELSE 'VEND_PAY' END, 'preparedBy', COALESCE(v_payment.data->>'preparedBy', v_payment.data->>'salesperson'), 'createdById', v_payment.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', data = EXCLUDED.data;

    -- 3. Allocation Updates
    IF v_is_receipt THEN
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedInvoices') = 'array' THEN v_payment.data->'appliedInvoices' ELSE '[]'::jsonb END) LOOP
            SELECT * INTO v_inv_record FROM docs_invoices WHERE id = (v_alloc->>'invoiceId') FOR UPDATE;
            IF FOUND THEN
                v_new_amt_paid := COALESCE((v_inv_record.data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric;
                UPDATE docs_invoices 
                SET data = jsonb_set(
                    jsonb_set(data, '{amountPaid}', to_jsonb(v_new_amt_paid)),
                    '{status}', 
                    CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN '"PAID"' ELSE '"PARTIAL"' END::jsonb
                ),
                status = CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                updated_at = NOW()
                WHERE id = v_inv_record.id;
            END IF;
        END LOOP;
    ELSE
        FOR v_alloc IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_payment.data->'appliedBills') = 'array' THEN v_payment.data->'appliedBills' ELSE '[]'::jsonb END) LOOP
            SELECT * INTO v_bill_record FROM docs_bills WHERE id = (v_alloc->>'billId') FOR UPDATE;
            IF FOUND THEN
                v_new_amt_paid := COALESCE((v_bill_record.data->>'amountPaid')::numeric, 0) + (v_alloc->>'amount')::numeric;
                UPDATE docs_bills 
                SET data = jsonb_set(
                    jsonb_set(data, '{amountPaid}', to_jsonb(v_new_amt_paid)),
                    '{status}', 
                    CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN '"PAID"' ELSE '"PARTIAL"' END::jsonb
                ),
                status = CASE WHEN v_new_amt_paid >= (data->>'total')::numeric - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                updated_at = NOW()
                WHERE id = v_bill_record.id;
            END IF;
        END LOOP;
    END IF;

    UPDATE docs_payments SET status = 'POSTED', data = jsonb_set(jsonb_set(data, '{status}', '"POSTED"'), '{journalEntryId}', to_jsonb(v_journal_id)), updated_at = NOW() WHERE id = p_payment_id;

    
    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create/Post Journal Entry RPC
CREATE OR REPLACE FUNCTION create_journal_entry(p_journal_data JSONB, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_journal_id TEXT;
    v_line JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_status TEXT;
    v_effective_company_id TEXT;
BEGIN
    v_journal_id := p_journal_data->>'id';
    v_status := p_journal_data->>'status';
    v_effective_company_id := COALESCE(p_company_id, p_journal_data->>'companyId');

    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    -- Only for non-new journals
    IF (p_journal_data->>'reference' IS NOT NULL AND p_journal_data->>'reference' <> 'NEW' AND p_journal_data->>'reference' NOT LIKE 'DRAFT-%') THEN
        SELECT id INTO v_journal_id FROM docs_journals 
        WHERE company_id = v_effective_company_id AND reference_number = p_journal_data->>'reference' LIMIT 1;
        
        IF v_journal_id IS NULL THEN 
            v_journal_id := p_journal_data->>'id';
        END IF;
    END IF;

    -- 1. Validate Balance if POSTED
    IF v_status = 'POSTED' THEN
        FOR v_line IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(p_journal_data->'lines') = 'array' THEN p_journal_data->'lines' ELSE '[]'::jsonb END) LOOP
            v_total_debit := v_total_debit + (v_line->>'debit')::numeric;
            v_total_credit := v_total_credit + (v_line->>'credit')::numeric;
        END LOOP;
        
        IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Journal entry is not balanced');
        END IF;
    END IF;

    -- 1. Ensure header exists (to satisfy FK for lines)
    -- We force status to DRAFT initially to bypass the balance trigger if it was already POSTED
    -- But we respect the immutability trigger
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, (p_journal_data->>'date')::date, p_journal_data->>'journalType', 'DRAFT', p_journal_data->>'reference', p_journal_data, NOW())
    ON CONFLICT (id) DO UPDATE SET 
        status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
        updated_at = NOW();

    -- 2. Sync Lines
    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
    
    FOR v_line IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(p_journal_data->'lines') = 'array' THEN p_journal_data->'lines' ELSE '[]'::jsonb END) LOOP
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES (COALESCE(v_line->>'id', 'JL-' || v_journal_id || '-' || floor(random()*1000000)::text), v_journal_id, v_effective_company_id, v_line->>'accountId', v_line->>'contactId', (v_line->>'debit')::numeric, (v_line->>'credit')::numeric, v_line->>'description');
    END LOOP;

    -- 3. Finalize Status (this will fire the AFTER UPDATE trigger check_journal_balance if status is POSTED)
    UPDATE docs_journals 
    SET status = v_status,
        data = p_journal_data,
        updated_at = NOW()
    WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Post Credit Note RPC
CREATE OR REPLACE FUNCTION post_credit_note(p_cn_id TEXT, p_company_id TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_cn RECORD;
    v_item JSONB;
    v_journal_id TEXT;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_product_record RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_idx INT := 0;
    v_ar_acc TEXT;
    v_rev_acc TEXT;
    v_inv_acc TEXT;
    v_cogs_acc TEXT;
    v_cogs_value NUMERIC;
    v_net_cost NUMERIC := 0;
    v_total_revenue_subtotal NUMERIC := 0;
    v_global_discount NUMERIC := 0;
    v_proportional_discount NUMERIC := 0;
    v_revenue_net NUMERIC := 0;
    v_tax_total NUMERIC := 0;
    v_tax_acc TEXT;
    v_effective_company_id TEXT;
    v_total_cogs NUMERIC := 0;
    v_tx_cost NUMERIC := 0;
    v_wh_id TEXT;
BEGIN
    -- 1. Get Credit Note
    SELECT * INTO v_cn FROM docs_credit_notes WHERE id = p_cn_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credit Note not found: %', p_cn_id; END IF;

    -- Safe fallback if data column is NULL
    IF v_cn.data IS NULL OR jsonb_typeof(v_cn.data) = 'null' THEN
        v_cn.data := jsonb_build_object(
            'id', v_cn.id,
            'number', COALESCE(v_cn.credit_note_number, v_cn.cn_number, 'CN-' || v_cn.id),
            'customerId', v_cn.customer_id,
            'date', v_cn.date,
            'total', COALESCE(v_cn.total, 0),
            'subtotal', COALESCE(v_cn.subtotal, v_cn.total, 0),
            'taxTotal', COALESCE(v_cn.tax_total, 0),
            'status', COALESCE(v_cn.status, 'DRAFT'),
            'items', '[]'::jsonb
        );
    END IF;

    -- Advanced fallback: If data->'items' is empty or null, build it from docs_credit_note_lines relational table
    IF NOT (v_cn.data ? 'items') OR jsonb_typeof(v_cn.data->'items') = 'null' OR jsonb_array_length(v_cn.data->'items') = 0 THEN
        v_cn.data := jsonb_set(
            v_cn.data,
            '{items}',
            COALESCE(
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', id,
                        'productId', product_id,
                        'quantity', quantity,
                        'unitPrice', unit_price,
                        'lineValue', COALESCE(line_value, total),
                        'discountMode', COALESCE(discount_mode, 'PERCENT'),
                        'discountRate', COALESCE(discount_rate, 0),
                        'type', type,
                        'description', description
                    )
                ) FROM docs_credit_note_lines WHERE credit_note_id = p_cn_id),
                '[]'::jsonb
            )
        );
    END IF;

    v_journal_id := COALESCE(v_cn.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_cn.id), 'CN-', ''), 'CN-', ''));
    
    -- Ensure we don't hit unq_journal_num_company if another ID has this reference
    SELECT id INTO v_journal_id FROM docs_journals 
    WHERE company_id = COALESCE(p_company_id, v_cn.company_id) AND reference_number = v_cn.data->>'number' LIMIT 1;

    IF v_journal_id IS NULL THEN
        v_journal_id := COALESCE(v_cn.data->>'journalEntryId', 'JE-' || replace(replace(UPPER(v_cn.id), 'CN-', ''), 'CN-', ''));
    END IF;

    -- Check if ALREADY POSTED: Only stop if status is indeed POSTED
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id AND status = 'POSTED') THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;

    v_effective_company_id := COALESCE(p_company_id, v_cn.company_id, v_cn.data->>'companyId');
    IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

    -- 2. Resolve Accounts
    SELECT id INTO v_ar_acc FROM docs_accounts WHERE code IN ('100201', '100200') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_rev_acc FROM docs_accounts WHERE code IN ('400100', '400000') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_inv_acc FROM docs_accounts WHERE code IN ('100501', '100500') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100') AND company_id = v_effective_company_id LIMIT 1;
    SELECT id INTO v_tax_acc FROM docs_accounts WHERE code IN ('200400', '200100') AND company_id = v_effective_company_id LIMIT 1;

    IF v_ar_acc IS NULL OR v_rev_acc IS NULL THEN 
       RAISE EXCEPTION 'Required accounts not found for company %', v_effective_company_id;
    END IF;

    -- 3. Calculate Global Totals for Proportional Distribution & Balancing
    v_total_revenue_subtotal := 0;
    v_global_discount := 0;
    v_tax_total := 0;
    v_total_cogs := 0;
    v_wh_id := 'wh-' || v_effective_company_id;
    
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_cn.data->'items') = 'array' THEN v_cn.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                v_net_cost := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := v_net_cost - COALESCE((v_item->>'discountRate')::numeric, 0);
                ELSE
                    v_net_cost := v_net_cost * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100);
                END IF;
                v_net_cost := ROUND(v_net_cost, 2);
            END IF;
            v_total_revenue_subtotal := v_total_revenue_subtotal + v_net_cost;

            -- Calculate COGS if product
            IF v_item->>'type' = 'PRODUCT' AND v_item->>'productId' IS NOT NULL AND v_item->>'productId' <> '' THEN
                SELECT avg_cost INTO v_tx_cost FROM docs_product_costs WHERE product_id = (v_item->>'productId') AND warehouse_id = v_wh_id AND company_id = v_effective_company_id;
                IF v_tx_cost IS NULL OR v_tx_cost = 0 THEN 
                    SELECT COALESCE(cost_price, (data->>'costPrice')::numeric, 0) INTO v_tx_cost FROM docs_products WHERE id = (v_item->>'productId'); 
                END IF;
                v_tx_cost := COALESCE(v_tx_cost, 0);
                v_total_cogs := v_total_cogs + ROUND(COALESCE((v_item->>'quantity')::numeric, 0) * v_tx_cost, 2);
            END IF;
        ELSIF v_item->>'type' = 'DISCOUNT' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
                IF v_item->>'discountMode' = 'FIXED' THEN
                    v_net_cost := -ROUND(COALESCE((v_item->>'discountRate')::numeric, 0), 2);
                ELSE
                    v_net_cost := -ROUND(v_total_revenue_subtotal * COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0, 2);
                END IF;
            END IF;
            v_global_discount := v_global_discount + v_net_cost;
        ELSIF v_item->>'type' = 'TAX' THEN
            v_net_cost := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
            IF v_net_cost = 0 THEN
               v_net_cost := COALESCE((v_item->>'manualValue')::numeric, ROUND((v_total_revenue_subtotal + v_global_discount) * (COALESCE((v_item->>'taxRate')::numeric, 0)/100.0), 2));
            END IF;
            v_tax_total := v_tax_total + v_net_cost;
        END IF;
    END LOOP;

    -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger for now
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_cn.date, 'CREDIT_NOTE', 'DRAFT', v_cn.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_cn.date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', v_cn.data->>'number', 'journalType', 'CREDIT_NOTE'), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW();

    -- Process Product Returns (Inventory Re-stocking and Movements Trigger generation)
    FOR v_item IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(v_cn.data->'items') = 'array' THEN v_cn.data->'items' ELSE '[]'::jsonb END) LOOP
        IF v_item->>'type' = 'PRODUCT' AND v_item->>'productId' IS NOT NULL AND v_item->>'productId' <> '' THEN
            SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
            IF FOUND THEN
                v_current_stock := COALESCE((v_product_record.data->'stockLevels'->>v_effective_company_id)::numeric, 0);
                v_new_stock := v_current_stock + COALESCE((v_item->>'quantity')::numeric, 0);
                
                UPDATE docs_products 
                SET data = jsonb_set(
                    CASE WHEN data ? 'stockLevels' THEN data ELSE data || '{"stockLevels": {}}'::jsonb END,
                    ('{stockLevels,' || v_effective_company_id || '}')::text[], 
                    v_new_stock::text::jsonb
                ),
                    updated_at = NOW()
                WHERE id = v_product_record.id;
            END IF;
        END IF;
    END LOOP;

    -- Zero out ALL existing journal lines for this journal (Zeroing Architecture)
    -- This includes zeroing any individual lines created by inventory movement triggers beforehand
    UPDATE docs_journal_lines SET debit = 0, credit = 0 WHERE journal_id = v_journal_id;

    -- Calculate balanced aggregated lines
    v_total_credit := ROUND(COALESCE((v_cn.data->>'total')::numeric, 0), 2);
    v_revenue_net := v_total_revenue_subtotal + v_global_discount;
    -- Balance check
    IF ROUND(v_revenue_net + v_tax_total, 2) != v_total_credit THEN
        v_revenue_net := ROUND(v_total_credit - v_tax_total, 2);
    END IF;

    -- Insert Single Distinct Aggregated AR Credit Line
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, v_ar_acc, COALESCE(v_cn.data->>'customerId', v_cn.data->>'contactId'), 0, v_total_credit, 'Credit Note total: ' || (v_cn.data->>'number'))
    ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;

    -- Insert Single Distinct Aggregated Revenue Debit Line
    IF v_revenue_net > 0 THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-rev-agg', v_journal_id, v_effective_company_id, v_rev_acc, NULL, v_revenue_net, 0, 'Sales Return: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;
    END IF;

    -- Insert Single Distinct Aggregated Tax Debit Line
    IF v_tax_total > 0 THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-tax-agg', v_journal_id, v_effective_company_id, v_tax_acc, NULL, v_tax_total, 0, 'Tax Return: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;
    END IF;

    -- Insert Single Distinct Aggregated Inventory Debit and COGS Credit lines
    IF v_total_cogs > 0 THEN
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-inv-agg', v_journal_id, v_effective_company_id, v_inv_acc, NULL, v_total_cogs, 0, 'Inventory Re-stocking: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;

        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-cogs-agg', v_journal_id, v_effective_company_id, v_cogs_acc, NULL, 0, v_total_cogs, 'COGS Reversal: ' || (v_cn.data->>'number'))
        ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, account_id = EXCLUDED.account_id, contact_id = EXCLUDED.contact_id, description = EXCLUDED.description;
    END IF;

    -- Update flat columns for sync correctly
    UPDATE docs_credit_notes 
    SET status = 'POSTED', 
        data = jsonb_set(
            jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'),
            '{journalEntryId}', to_jsonb(v_journal_id)
        ), 
        updated_at = NOW() 
    WHERE id = p_cn_id;

    -- Upsert Header
    INSERT INTO docs_journals (id, company_id, date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_cn.date, 'CREDIT_NOTE', 'POSTED', v_cn.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_cn.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_cn.data->>'number', 'journalType', 'CREDIT_NOTE', 'preparedBy', COALESCE(v_cn.data->>'preparedBy', v_cn.data->>'salesperson'), 'createdById', v_cn.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', data = EXCLUDED.data;

    UPDATE docs_journals SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{lines}', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'accountId', account_id, 'debit', debit, 'credit', credit, 'description', description, 'contactId', contact_id)) FROM docs_journal_lines WHERE journal_id = v_journal_id AND (debit != 0 OR credit != 0)), '[]'::jsonb)) WHERE id = v_journal_id;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


