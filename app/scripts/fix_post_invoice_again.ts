import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.DATABASE_URL;

const sql = `
CREATE OR REPLACE FUNCTION public.post_invoice(p_invoice_id text, p_company_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
        v_invoice RECORD;
        v_item JSONB;
        v_items_json JSONB;
        v_journal_id TEXT;
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
        
        -- Cash sale variables
        v_is_cash_sale BOOLEAN;
        v_liquidity_acc TEXT;
        v_pay_id TEXT;
    BEGIN
        SELECT * INTO v_invoice FROM docs_invoices WHERE id = p_invoice_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;
        
        v_journal_id := 'JE-' || replace(replace(UPPER(v_invoice.id), 'INV-', ''), 'INV-', '');
        IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
            RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
        END IF;

        v_effective_company_id := COALESCE(p_company_id, v_invoice.company_id);
        IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

        -- Accounts Receivable
        SELECT id INTO v_ar_acc FROM docs_accounts WHERE code IN ('100201', '100200') AND company_id = v_effective_company_id LIMIT 1;
        IF v_ar_acc IS NULL THEN
            SELECT id INTO v_ar_acc FROM docs_accounts WHERE (sub_type IN ('RECEIVABLE', 'ACCOUNTS_RECEIVABLE') OR type = 'ASSET') AND name ILIKE '%receivable%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_ar_acc IS NULL THEN
            SELECT id INTO v_ar_acc FROM docs_accounts WHERE type = 'ASSET' AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        -- Revenue
        SELECT id INTO v_rev_acc FROM docs_accounts WHERE code IN ('400100', '400000') AND company_id = v_effective_company_id LIMIT 1;
        IF v_rev_acc IS NULL THEN
            SELECT id INTO v_rev_acc FROM docs_accounts WHERE (sub_type IN ('REVENUE', 'SALES') OR type IN ('REVENUE', 'INCOME')) AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_rev_acc IS NULL THEN
            SELECT id INTO v_rev_acc FROM docs_accounts WHERE type IN ('REVENUE', 'INCOME') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_rev_acc IS NULL THEN
            SELECT id INTO v_rev_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        -- COGS
        SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100') AND company_id = v_effective_company_id LIMIT 1;
        IF v_cogs_acc IS NULL THEN
            SELECT id INTO v_cogs_acc FROM docs_accounts WHERE (sub_type = 'COGS' OR type = 'COGS' OR type = 'EXPENSE') AND name ILIKE '%cost%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_cogs_acc IS NULL THEN
            SELECT id INTO v_cogs_acc FROM docs_accounts WHERE type IN ('EXPENSE', 'COGS') AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        -- Inventory
        SELECT id INTO v_inv_acc FROM docs_accounts WHERE code IN ('100501', '100502', '100500') AND company_id = v_effective_company_id LIMIT 1;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE (sub_type = 'INVENTORY' OR type = 'ASSET') AND name ILIKE '%inventory%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE type = 'ASSET' AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        -- Tax
        SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200400' AND company_id = v_effective_company_id LIMIT 1;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE (sub_type = 'TAX' OR type = 'LIABILITY') AND name ILIKE '%tax%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE type = 'LIABILITY' AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', id,
              'productId', product_id,
              'quantity', quantity,
              'unitPrice', unit_price,
              'lineValue', COALESCE(line_value, total),
              'type', COALESCE(type, 'PRODUCT'),
              'uom', uom,
              'description', description,
              'displayDescription', display_description,
              'discountMode', COALESCE(discount_mode, 'PERCENT'),
              'discountRate', COALESCE(discount_rate, 0),
              'discountValue', COALESCE(discount, 0),
              'taxValue', COALESCE(tax, 0),
              'total', total,
              'serialNumbers', COALESCE(serial_numbers, '[]'::jsonb)
            ) ORDER BY id
        ), '[]'::jsonb) INTO v_items_json
        FROM docs_invoice_lines 
        WHERE invoice_id = p_invoice_id;

        v_total_revenue_subtotal := 0;
        v_global_discount := 0;
        v_tax_total := 0;
        
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json) LOOP
            IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                IF v_item_subtotal = 0 THEN
                    v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                    IF v_item->>'discountMode' = 'FIXED' THEN
                        v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                    ELSE
                        v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0);
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

        -- Update Invoice status to POSTED unless already PAID/PARTIAL
        UPDATE docs_invoices 
        SET status = CASE WHEN status IN ('PAID', 'PARTIALLY_PAID', 'PARTIAL', 'IN_PAYMENT') THEN status ELSE 'POSTED' END, 
            updated_at = NOW() 
        WHERE id = p_invoice_id 
        RETURNING * INTO v_invoice;

        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, v_ar_acc, v_invoice.customer_id, ROUND(COALESCE(v_invoice.total, 0), 2), 0, 'AR: ' || COALESCE(v_invoice.invoice_number, '(DRAFT)'));
        v_total_debit := ROUND(COALESCE(v_invoice.total, 0), 2);

        DECLARE
            v_discount_distributed NUMERIC := 0;
            v_items_count INT := 0;
            v_current_item_idx INT := 0;
        BEGIN
            SELECT count(*) INTO v_items_count FROM jsonb_array_elements(v_items_json) it WHERE it->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE');

            FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json) LOOP
                v_idx := v_idx + 1;
                
                IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                    v_current_item_idx := v_current_item_idx + 1;
                    v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                    IF v_item_subtotal = 0 THEN
                        v_item_subtotal := COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0);
                        IF v_item->>'discountMode' = 'FIXED' THEN
                            v_item_subtotal := v_item_subtotal - COALESCE((v_item->>'discountRate')::numeric, 0);
                        ELSE
                            v_item_subtotal := v_item_subtotal * (1 - COALESCE((v_item->>'discountRate')::numeric, 0) / 100.0);
                        END IF;
                        v_item_subtotal := ROUND(v_item_subtotal, 2);
                    END IF;
                    
                    IF v_current_item_idx = v_items_count THEN
                        v_proportional_discount := ROUND(v_global_discount - v_discount_distributed, 2);
                    ELSE
                        v_proportional_discount := CASE WHEN v_total_revenue_subtotal > 0 THEN (v_item_subtotal / v_total_revenue_subtotal) * v_global_discount ELSE 0 END;
                        v_proportional_discount := ROUND(v_proportional_discount, 2);
                        v_discount_distributed := v_discount_distributed + v_proportional_discount;
                    END IF;

                    v_revenue_net := ROUND(v_item_subtotal + v_proportional_discount, 2);

                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-rev-' || v_idx, v_journal_id, v_effective_company_id, v_rev_acc, 0, v_revenue_net, 'Revenue: ' || (v_item->>'description'));
                    v_total_credit := v_total_credit + v_revenue_net;

                    IF v_item->>'type' = 'PRODUCT' THEN
                        SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
                        IF FOUND THEN
                            v_current_stock := COALESCE(v_product_record.quantity_on_hand, 0);
                            v_new_stock := v_current_stock - COALESCE((v_item->>'quantity')::numeric, 0);

                            UPDATE docs_products 
                            SET quantity_on_hand = v_new_stock,
                                updated_at = NOW()
                            WHERE id = v_product_record.id;

                            -- COGS and Inventory Asset Journal Lines handled by Perpetual Inventory Trigger
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

        v_total_debit := ROUND(v_total_debit, 2);
        v_total_credit := ROUND(v_total_credit, 2);
        IF v_total_debit != v_total_credit THEN
            IF ABS(v_total_debit - v_total_credit) <= 0.10 THEN
                UPDATE docs_journal_lines SET credit = credit + (v_total_debit - v_total_credit)
                WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-rev-' || v_idx;
                v_total_credit := v_total_debit;
            ELSE
                RAISE EXCEPTION 'Invoice Failed: Unbalanced Invoice (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
            END IF;
        END IF;

        INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at)
        VALUES (
          v_journal_id, 
          v_effective_company_id, 
          v_invoice.date, 
          v_invoice.date, 
          'INV', 
          'POSTED', 
          v_invoice.invoice_number, 
          v_invoice.invoice_number, 
          COALESCE(v_invoice.salesperson, 'System'), 
          v_invoice.created_by_id, 
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET 
            status = 'POSTED',
            updated_at = NOW();

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
            INSERT INTO docs_payments (id, company_id, date, contact_id, status, type, amount, payment_date, data, updated_at)
            VALUES (
                v_pay_id, v_effective_company_id, v_invoice.date, v_invoice.customer_id, 'DRAFT', 'RECEIPT', COALESCE(v_invoice.total, 0), v_invoice.date,
                jsonb_build_object(
                    'id', v_pay_id, 'amount', COALESCE(v_invoice.total, 0),
                    'contactId', v_invoice.customer_id, 'date', v_invoice.date, 'method', 'CASH', 'type', 'RECEIPT',
                    'accountId', v_liquidity_acc, 'status', 'DRAFT', 'companyId', v_effective_company_id,
                    'appliedInvoices', jsonb_build_array(jsonb_build_object('invoiceId', p_invoice_id, 'invoiceNumber', COALESCE(v_invoice.invoice_number, '(DRAFT)'), 'amount', COALESCE(v_invoice.total, 0), 'remaining', 0))
                ),
                NOW()
            ) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, date = EXCLUDED.date, payment_date = EXCLUDED.payment_date, amount = EXCLUDED.amount, type = EXCLUDED.type, updated_at = NOW();
            
            PERFORM post_payment(v_pay_id, v_effective_company_id);
            
            -- Make sure the invoice is marked as PAID in docs_invoices as well
            UPDATE docs_invoices SET status = 'PAID', data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"PAID"') WHERE id = p_invoice_id;
        END IF;

        RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
    END;
$function$;
`;

async function main() {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query(sql);
    console.log('Fixed post_invoice');
  } catch (err) {
    console.error('Error runnig sql', err);
  }

  // Same for post_bill
  const billSql = `
CREATE OR REPLACE FUNCTION public.post_bill(p_bill_id text, p_company_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
        v_bill RECORD;
        v_item JSONB;
        v_items_json JSONB;
        v_journal_id TEXT;
        v_total_debit NUMERIC := 0;
        v_total_credit NUMERIC := 0;
        v_product_record RECORD;
        v_current_stock NUMERIC;
        v_new_stock NUMERIC;
        v_item_subtotal NUMERIC := 0;
        v_expense_net NUMERIC := 0;
        v_ap_acc TEXT;
        v_exp_acc TEXT;
        v_inv_acc TEXT;
        v_tax_acc TEXT;
        v_tax_total NUMERIC := 0;
        v_idx INT := 0;
        v_effective_company_id TEXT;
    BEGIN
        SELECT * INTO v_bill FROM docs_bills WHERE id = p_bill_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found: %', p_bill_id; END IF;
        
        v_journal_id := 'JE-' || replace(replace(UPPER(v_bill.id), 'BILL-', ''), 'BILL-', '');
        IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
            RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
        END IF;

        v_effective_company_id := COALESCE(p_company_id, v_bill.company_id);
        IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

        SELECT id INTO v_ap_acc FROM docs_accounts WHERE code IN ('200101', '200100') AND company_id = v_effective_company_id LIMIT 1;
        IF v_ap_acc IS NULL THEN
            SELECT id INTO v_ap_acc FROM docs_accounts WHERE (sub_type IN ('PAYABLE', 'ACCOUNTS_PAYABLE') OR type = 'LIABILITY') AND name ILIKE '%payable%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_ap_acc IS NULL THEN
            SELECT id INTO v_ap_acc FROM docs_accounts WHERE type = 'LIABILITY' AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_exp_acc FROM docs_accounts WHERE code IN ('500201', '600100') AND company_id = v_effective_company_id LIMIT 1;
        IF v_exp_acc IS NULL THEN
            SELECT id INTO v_exp_acc FROM docs_accounts WHERE (sub_type = 'EXPENSE' OR type = 'EXPENSE') AND name ILIKE '%expense%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_exp_acc IS NULL THEN
            SELECT id INTO v_exp_acc FROM docs_accounts WHERE type = 'EXPENSE' AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_inv_acc FROM docs_accounts WHERE code IN ('100501', '100502', '100500') AND company_id = v_effective_company_id LIMIT 1;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE (sub_type = 'INVENTORY' OR type = 'ASSET') AND name ILIKE '%inventory%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE type = 'ASSET' AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '100400' AND company_id = v_effective_company_id LIMIT 1;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE (sub_type = 'TAX' OR type = 'ASSET') AND name ILIKE '%tax%' AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE type = 'ASSET' AND company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'id', id,
              'productId', product_id,
              'quantity', quantity,
              'unitPrice', unit_price,
              'lineValue', COALESCE(line_value, total),
              'type', COALESCE(type, 'PRODUCT'),
              'description', description,
              'total', total
            ) ORDER BY id
        ), '[]'::jsonb) INTO v_items_json
        FROM docs_bill_lines 
        WHERE bill_id = p_bill_id;

        UPDATE docs_bills 
        SET status = CASE WHEN status IN ('PAID', 'PARTIALLY_PAID', 'PARTIAL', 'IN_PAYMENT') THEN status ELSE 'POSTED' END, 
            updated_at = NOW() 
        WHERE id = p_bill_id 
        RETURNING * INTO v_bill;

        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-ap', v_journal_id, v_effective_company_id, v_ap_acc, v_bill.vendor_id, 0, ROUND(COALESCE(v_bill.total, 0), 2), 'AP: ' || COALESCE(v_bill.bill_number, '(DRAFT)'));
        v_total_credit := ROUND(COALESCE(v_bill.total, 0), 2);

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json) LOOP
            v_idx := v_idx + 1;
            
            IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                IF v_item_subtotal = 0 THEN
                    v_item_subtotal := ROUND(COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unitPrice')::numeric, 0), 2);
                END IF;

                IF v_item->>'type' = 'PRODUCT' THEN
                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_acc, v_item_subtotal, 0, 'Inventory: ' || (v_item->>'description'));
                    v_total_debit := v_total_debit + v_item_subtotal;

                    SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
                    IF FOUND THEN
                        v_current_stock := COALESCE(v_product_record.quantity_on_hand, 0);
                        v_new_stock := v_current_stock + COALESCE((v_item->>'quantity')::numeric, 0);

                        UPDATE docs_products 
                        SET quantity_on_hand = v_new_stock,
                            updated_at = NOW()
                        WHERE id = v_product_record.id;
                    END IF;
                ELSE
                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-exp-' || v_idx, v_journal_id, v_effective_company_id, v_exp_acc, v_item_subtotal, 0, 'Expense: ' || (v_item->>'description'));
                    v_total_debit := v_total_debit + v_item_subtotal;
                END IF;
            ELSIF v_item->>'type' = 'TAX' THEN
                v_item_subtotal := ROUND(COALESCE((v_item->>'lineValue')::numeric, 0), 2);
                
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-tax-' || v_idx, v_journal_id, v_effective_company_id, v_tax_acc, v_item_subtotal, 0, 'Tax: ' || (v_item->>'description'));
                v_total_debit := v_total_debit + v_item_subtotal;
            END IF;
        END LOOP;

        v_total_debit := ROUND(v_total_debit, 2);
        v_total_credit := ROUND(v_total_credit, 2);
        IF v_total_debit != v_total_credit THEN
            IF ABS(v_total_debit - v_total_credit) <= 0.10 THEN
                UPDATE docs_journal_lines SET debit = debit + (v_total_credit - v_total_debit)
                WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-inv-' || v_idx;
                IF NOT FOUND THEN
                    UPDATE docs_journal_lines SET debit = debit + (v_total_credit - v_total_debit)
                    WHERE journal_id = v_journal_id AND id = 'JL-' || v_journal_id || '-exp-' || v_idx;
                END IF;
                v_total_debit := v_total_credit;
            ELSE
                RAISE EXCEPTION 'Bill Failed: Unbalanced Bill (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
            END IF;
        END IF;

        INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, reference, prepared_by, created_by_id, updated_at)
        VALUES (
          v_journal_id, 
          v_effective_company_id, 
          v_bill.date, 
          v_bill.date, 
          'BILL', 
          'POSTED', 
          v_bill.bill_number, 
          v_bill.bill_number, 
          v_bill.created_by_id, 
          v_bill.created_by_id, 
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET 
            status = 'POSTED',
            updated_at = NOW();

        RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
    END;
$function$;
  `

  try {
    await c.query(billSql);
    console.log('Fixed post_bill');
  } catch (err) {
    console.error('Error runnig bill sql', err);
  }

  await c.end();
}
main();
