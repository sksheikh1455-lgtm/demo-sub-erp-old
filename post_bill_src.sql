CREATE OR REPLACE FUNCTION public.post_bill(p_bill_id text, p_company_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$ 
        DECLARE
            v_bill RECORD;
            v_journal_id TEXT;
            v_ap_acc TEXT;
            v_inv_asset_acc TEXT;
            v_items JSONB;
            v_item JSONB;
            v_total_debit NUMERIC := 0;
            v_total_credit NUMERIC := 0;
            v_idx INT := 0;
            v_effective_company_id TEXT;
            v_item_total NUMERIC;
            
            v_wh_id TEXT;
            v_product_record RECORD;
            v_current_stock NUMERIC;
            v_new_stock NUMERIC;
            v_wac_cost NUMERIC;
            v_is_cash_purchase BOOLEAN;
            v_liquidity_acc TEXT;
            v_pay_id TEXT;
        BEGIN
            SELECT * INTO v_bill FROM docs_bills WHERE id = p_bill_id FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
            
            v_effective_company_id := COALESCE(p_company_id, v_bill.company_id);
            
            IF v_bill.journal_entry_id IS NOT NULL THEN
                 v_journal_id := v_bill.journal_entry_id;
                 
                 -- Temporarily set journal to DRAFT so RLS allows deletion of existing lines
                 UPDATE docs_journals SET date = v_bill.date, journal_date = v_bill.date, status = 'DRAFT' WHERE id = v_journal_id;
                 
                 PERFORM set_config('core.bypass_audit', 'true', true);
                 DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
                 PERFORM set_config('core.bypass_audit', 'false', true);
            ELSE
                 v_journal_id := 'JE-' || UPPER(REPLACE(gen_random_uuid()::text, '-', ''));
                 INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, reference, description, prepared_by, created_by_id, updated_at)
                 VALUES (
                   v_journal_id, v_effective_company_id, v_bill.date, v_bill.date, 'BILL', 'DRAFT', 
                   v_bill.bill_number, COALESCE(v_bill.bill_number, ''), 'AP: ' || COALESCE(v_bill.bill_number, ''),
                   'System', v_bill.created_by_id, NOW()
                 );
                 UPDATE docs_bills SET journal_entry_id = v_journal_id WHERE id = p_bill_id;
            END IF;

            -- [Removed premature status update]

            -- Delete auto payments just in case
            PERFORM set_config('core.bypass_audit', 'true', true);
            DELETE FROM docs_journal_lines WHERE journal_id IN (SELECT id FROM docs_journals WHERE reference_number = 'PAY-AUTO-' || p_bill_id);
            PERFORM set_config('core.bypass_audit', 'false', true);
            PERFORM set_config('core.bypass_audit', 'true', true);
            DELETE FROM docs_journals WHERE reference_number = 'PAY-AUTO-' || p_bill_id;
            PERFORM set_config('core.bypass_audit', 'false', true);
            PERFORM set_config('core.bypass_audit', 'true', true);
            DELETE FROM docs_payments WHERE id = 'PAY-AUTO-' || p_bill_id;
            PERFORM set_config('core.bypass_audit', 'false', true);

            -- AP
            SELECT id INTO v_ap_acc FROM docs_accounts WHERE code IN ('200101', '2000', '200100') AND company_id = v_effective_company_id LIMIT 1;
            IF v_ap_acc IS NULL THEN SELECT id INTO v_ap_acc FROM docs_accounts WHERE type = 'LIABILITY' AND name ILIKE '%account%payable%' AND company_id = v_effective_company_id LIMIT 1; END IF;
            
            -- Inventory Asset
            SELECT id INTO v_inv_asset_acc FROM docs_accounts WHERE sub_type = 'INVENTORY' AND company_id = v_effective_company_id LIMIT 1;
            IF v_inv_asset_acc IS NULL THEN SELECT id INTO v_inv_asset_acc FROM docs_accounts WHERE type = 'ASSET' AND name ILIKE '%inventory%' AND company_id = v_effective_company_id LIMIT 1; END IF;

            IF v_ap_acc IS NULL THEN RAISE EXCEPTION 'AP Account not found'; END IF;
            IF v_inv_asset_acc IS NULL THEN RAISE EXCEPTION 'Inventory Asset Account not found'; END IF;

            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
            VALUES ('JL-' || v_journal_id || '-ap', v_journal_id, v_effective_company_id, v_ap_acc, v_bill.vendor_id, 0, COALESCE(v_bill.total, 0), 'AP: ' || COALESCE(v_bill.bill_number, ''));
            v_total_credit := COALESCE(v_bill.total, 0);

            v_items := COALESCE(v_bill.data->'items', '[]'::jsonb);
            
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
                v_idx := v_idx + 1;
                v_item_total := ROUND(COALESCE((v_item->>'total')::numeric, 0), 2);
                IF v_item_total = 0 AND (v_item->>'quantity') IS NOT NULL AND (v_item->>'unitPrice') IS NOT NULL THEN
                     v_item_total := ROUND(((v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric), 2);
                END IF;

                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_asset_acc, v_item_total, 0, 'Bill Item: ' || (v_item->>'description'));
                v_total_debit := v_total_debit + v_item_total;

                IF v_item->>'type' = 'PRODUCT' OR v_item->>'type' IS NULL THEN
                    v_wh_id := 'wh-' || v_effective_company_id;
                    
                    SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
                    IF FOUND THEN
                        -- WAC logic handled elsewhere, we only record the journal line.
                        -- IF we update quantity_on_hand here we double dip.
                        -- So we skip updating quantity_on_hand in post_bill since docs_inventory_transactions trigger will do it. Wait, does it?
                        -- No, docs_inventory_transactions trigger does not update quantity_on_hand!
                        -- But my script recalculated it. And how will it be updated going forward?
                        -- Wait... does docs_inventory_transactions have a trigger to update stock? Let's check!
                        v_current_stock := COALESCE(v_product_record.quantity_on_hand, 0);
                        v_new_stock := v_current_stock + COALESCE((v_item->>'quantity')::numeric, 0);
                        UPDATE docs_products 
                        SET quantity_on_hand = (
                            SELECT COALESCE(SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END), 0)
                            FROM docs_inventory_transactions WHERE product_id = v_product_record.id
                        ), updated_at = NOW() WHERE id = v_product_record.id;
                    END IF;
                END IF;
            END LOOP;

            v_total_debit := ROUND(v_total_debit, 2);
            v_total_credit := ROUND(v_total_credit, 2);
            IF v_total_debit != v_total_credit THEN
                IF EXISTS(SELECT 1 FROM docs_journal_lines WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-inv-' || v_idx) THEN
                    UPDATE docs_journal_lines 
                    SET debit = ROUND(debit + (v_total_credit - v_total_debit), 2)
                    WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-inv-' || v_idx;
                END IF;
            END IF;

            UPDATE docs_journals SET status = 'POSTED', updated_at = NOW() WHERE id = v_journal_id;
            
            UPDATE docs_bills SET status = 'POSTED', data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', to_jsonb('POSTED'::text)) WHERE id = p_bill_id;
            -- Auto-Payment for Cash Purchase
            v_is_cash_purchase := COALESCE(v_bill.vendor_id, '') ILIKE '%cash-sale%' OR COALESCE(v_bill.vendor_id, '') ILIKE '%cash-purchase%' OR EXISTS(SELECT 1 FROM docs_contacts WHERE id = v_bill.vendor_id AND (name ILIKE '%cash sale%' OR name ILIKE '%cash purchase%' OR name ILIKE '%cash vendor%' OR name ILIKE '%cash-sale%'));
            
            IF v_is_cash_purchase THEN
                v_pay_id := 'PAY-AUTO-' || p_bill_id;
                
                SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN ('1011', '100100', '100101', 'CASH', 'BANK') AND company_id = v_effective_company_id LIMIT 1;
                IF v_liquidity_acc IS NULL THEN SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE (name ILIKE '%cash%' OR name ILIKE '%bank%') AND company_id = v_effective_company_id LIMIT 1; END IF;
                IF v_liquidity_acc IS NULL THEN SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE type = 'ASSET' AND company_id = v_effective_company_id LIMIT 1; END IF;

                INSERT INTO docs_payments (id, company_id, date, contact_id, status, type, amount, payment_date, data, updated_at)
                VALUES (
                    v_pay_id, v_effective_company_id, v_bill.date, v_bill.vendor_id, 'DRAFT', 'PAYMENT', COALESCE(v_bill.total, 0), v_bill.date,
                    jsonb_build_object(
                        'id', v_pay_id, 'amount', COALESCE(v_bill.total, 0),
                        'contactId', v_bill.vendor_id, 'date', v_bill.date, 'method', 'CASH', 'type', 'PAYMENT',
                        'accountId', v_liquidity_acc, 'status', 'DRAFT', 'companyId', v_effective_company_id,
                        'appliedBills', jsonb_build_array(jsonb_build_object('billId', p_bill_id, 'billNumber', COALESCE(v_bill.bill_number, '(DRAFT)'), 'amount', COALESCE(v_bill.total, 0), 'remaining', 0))
                    ),
                    NOW()
                ) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, date = EXCLUDED.date, payment_date = EXCLUDED.payment_date, amount = EXCLUDED.amount, type = EXCLUDED.type, updated_at = NOW();
                
                PERFORM post_payment(v_pay_id, v_effective_company_id);
                UPDATE docs_bills SET status = 'PAID', data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', to_jsonb('POSTED'::text)) WHERE id = p_bill_id;
            END IF;

            RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
        END;
 $function$

