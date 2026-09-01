import pkg from "pg";
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL.replace('sk445@raihan', 'sk445%40raihan');

const sql = `
DROP FUNCTION IF EXISTS post_invoice(text, text);
CREATE OR REPLACE FUNCTION post_invoice(p_invoice_id text, p_company_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
            DECLARE
                v_invoice RECORD;
                v_journal_id TEXT;
                v_rev_acc TEXT;
                v_ar_acc TEXT;
                v_tax_acc TEXT;
                v_total_debit NUMERIC := 0;
                v_total_credit NUMERIC := 0;
                v_item JSONB;
                v_items_count INT;
                v_current_item_idx INT := 0;
                v_item_subtotal NUMERIC;
                v_global_discount NUMERIC := 0;
                v_proportional_discount NUMERIC;
                v_discount_distributed NUMERIC := 0;
                v_total_revenue_subtotal NUMERIC := 0;
                v_revenue_net NUMERIC;
                v_idx INT := 0;
                v_is_cash_sale BOOLEAN;
                v_liquidity_acc TEXT;
                v_pay_id TEXT;
                v_tax_total NUMERIC;
                v_wh_id TEXT;
                v_wac_cost NUMERIC;
                v_product_record RECORD;
                v_effective_company_id TEXT;
            BEGIN
                SELECT * INTO v_invoice FROM docs_invoices WHERE id = p_invoice_id;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
                END IF;

                v_effective_company_id := COALESCE(v_invoice.company_id, p_company_id);

                v_journal_id := 'JE-' || UPPER(v_invoice.id);
                
                IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id AND status = 'POSTED') THEN
                   RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id, 'message', 'Already posted');
                END IF;

                DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;
                DELETE FROM docs_journals WHERE id = v_journal_id;

                INSERT INTO docs_journals (id, company_id, date, reference, notes, status, created_by)
                VALUES (v_journal_id, v_effective_company_id, v_invoice.date, COALESCE(v_invoice.invoice_number, v_invoice.id), 'Invoice ' || COALESCE(v_invoice.invoice_number, v_invoice.id), 'DRAFT', v_invoice.customer_id);

                
                SELECT id INTO v_ar_acc FROM docs_accounts WHERE (code IN ('1012','100200','100201','AR') OR data->>'code' IN ('1012','100200','100201','AR')) AND company_id = v_effective_company_id LIMIT 1;
                IF v_ar_acc IS NULL THEN SELECT id INTO v_ar_acc FROM docs_accounts WHERE (type = 'ASSET' OR data->>'type' = 'ASSET') AND (name ILIKE '%receivable%' OR data->>'name' ILIKE '%receivable%') AND company_id = v_effective_company_id LIMIT 1; END IF;
                IF v_ar_acc IS NULL THEN 
                    v_ar_acc := 'acc-ar-' || v_effective_company_id;
                    INSERT INTO docs_accounts (id, company_id, code, name, type, data) VALUES (v_ar_acc, v_effective_company_id, 'AR', 'Accounts Receivable', 'ASSET', '{"code":"AR","name":"Accounts Receivable","type":"ASSET"}') ON CONFLICT DO NOTHING;
                END IF;

                SELECT id INTO v_rev_acc FROM docs_accounts WHERE (code IN ('4011', '4000', '400100', 'REVENUE', 'SALES') OR data->>'code' IN ('4011', '4000', '400100', 'REVENUE', 'SALES')) AND company_id = v_effective_company_id LIMIT 1;
                IF v_rev_acc IS NULL THEN SELECT id INTO v_rev_acc FROM docs_accounts WHERE (type = 'REVENUE' OR data->>'type' = 'REVENUE') AND company_id = v_effective_company_id LIMIT 1; END IF;
                IF v_rev_acc IS NULL THEN
                    v_rev_acc := 'acc-rev-' || v_effective_company_id;
                    INSERT INTO docs_accounts (id, company_id, code, name, type, data) VALUES (v_rev_acc, v_effective_company_id, 'REV', 'General Revenue', 'REVENUE', '{"code":"REV","name":"General Revenue","type":"REVENUE"}') ON CONFLICT DO NOTHING;
                END IF;

                SELECT id INTO v_tax_acc FROM docs_accounts WHERE (code IN ('2011', '200100', 'TAX_PAYABLE') OR data->>'code' IN ('2011', '200100', 'TAX_PAYABLE')) AND company_id = v_effective_company_id LIMIT 1;
                IF v_tax_acc IS NULL THEN SELECT id INTO v_tax_acc FROM docs_accounts WHERE (name ILIKE '%tax%payable%' OR data->>'name' ILIKE '%tax%payable%') AND company_id = v_effective_company_id LIMIT 1; END IF;
                IF v_tax_acc IS NULL THEN SELECT id INTO v_tax_acc FROM docs_accounts WHERE (type = 'LIABILITY' OR data->>'type' = 'LIABILITY') AND company_id = v_effective_company_id LIMIT 1; END IF;
                IF v_tax_acc IS NULL THEN
                    v_tax_acc := 'acc-tax-' || v_effective_company_id;
                    INSERT INTO docs_accounts (id, company_id, code, name, type, data) VALUES (v_tax_acc, v_effective_company_id, 'TAX', 'Tax Payable', 'LIABILITY', '{"code":"TAX","name":"Tax Payable","type":"LIABILITY"}') ON CONFLICT DO NOTHING;
                END IF;

                -- Create AR debit line
                INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
                VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, 
                        v_ar_acc,
                        v_invoice.customer_id, COALESCE(v_invoice.total, 0), 0, 'Accounts Receivable: ' || COALESCE(v_invoice.invoice_number, v_invoice.id));

                
                v_total_debit := COALESCE(v_invoice.total, 0);

                v_global_discount := COALESCE(CAST(v_invoice.data->>'discountTotal' AS NUMERIC), 0);

                SELECT COUNT(*) INTO v_items_count FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END) AS i
                WHERE i->>'type' = 'PRODUCT' OR i->>'type' IS NULL;

                FOR v_item IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END)
                LOOP
                    IF v_item->>'type' = 'PRODUCT' OR v_item->>'type' IS NULL THEN
                        IF (v_item->>'quantity') IS NOT NULL AND (v_item->>'unitPrice') IS NOT NULL THEN
                           v_total_revenue_subtotal := v_total_revenue_subtotal + COALESCE((v_item->>'lineValue')::numeric, (v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric);
                        ELSE
                           v_total_revenue_subtotal := v_total_revenue_subtotal + COALESCE((v_item->>'lineValue')::numeric, 0);
                        END IF;
                    END IF;
                END LOOP;

                BEGIN
                    FOR v_item IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_invoice.data->'items') = 'array' THEN v_invoice.data->'items' ELSE '[]'::jsonb END)
                    LOOP
                        v_idx := v_idx + 1;
                        IF v_item->>'type' = 'PRODUCT' OR v_item->>'type' IS NULL THEN
                            v_current_item_idx := v_current_item_idx + 1;
                            
                            IF (v_item->>'quantity') IS NOT NULL AND (v_item->>'unitPrice') IS NOT NULL THEN
                               v_item_subtotal := COALESCE((v_item->>'lineValue')::numeric, (v_item->>'quantity')::numeric * (v_item->>'unitPrice')::numeric);
                            ELSE
                               v_item_subtotal := COALESCE((v_item->>'lineValue')::numeric, 0);
                            END IF;
                            
                            IF v_current_item_idx = v_items_count THEN
                                v_proportional_discount := ROUND(v_global_discount - v_discount_distributed, 2);
                            ELSE
                                v_proportional_discount := CASE WHEN v_total_revenue_subtotal > 0 THEN (v_item_subtotal / v_total_revenue_subtotal) * v_global_discount ELSE 0 END;
                                v_proportional_discount := ROUND(v_proportional_discount, 2);
                                v_discount_distributed := v_discount_distributed + v_proportional_discount;
                            END IF;

                            v_revenue_net := ROUND(v_item_subtotal - v_proportional_discount, 2); 

                            INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                            VALUES ('JL-' || v_journal_id || '-rev-' || v_idx, v_journal_id, v_effective_company_id, v_rev_acc, 0, v_revenue_net, 'Revenue: ' || (v_item->>'description'));
                            v_total_credit := v_total_credit + v_revenue_net;

                            IF v_item->>'type' = 'PRODUCT' OR v_item->>'type' IS NULL THEN
                                v_wh_id := 'wh-' || v_effective_company_id;
                                SELECT avg_cost INTO v_wac_cost FROM docs_product_costs 
                                WHERE product_id = (v_item->>'productId') AND warehouse_id = v_wh_id AND company_id = v_effective_company_id;
                                
                                IF v_wac_cost IS NULL THEN
                                   SELECT cost_price INTO v_wac_cost FROM docs_products WHERE id = (v_item->>'productId');
                                END IF;
                                IF v_wac_cost IS NULL THEN v_wac_cost := 0; END IF;

                                UPDATE docs_invoice_lines 
                                SET cost_price_at_sale = v_wac_cost
                                WHERE id = (v_item->>'id');

                                SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId');
                            END IF;
                        ELSIF v_item->>'type' = 'TAX' THEN
                            v_tax_total := ROUND(COALESCE((v_item->>'lineValue')::numeric, COALESCE((v_item->>'taxAmount')::numeric, 0)), 2);
                            IF v_tax_total = 0 THEN
                                 v_tax_total := ROUND(COALESCE((v_item->>'taxTotal')::numeric, 0), 2);
                            END IF;
                            
                            IF v_tax_total > 0 THEN
                               INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                               VALUES ('JL-' || v_journal_id || '-tax-' || v_idx, v_journal_id, v_effective_company_id, v_tax_acc, 0, v_tax_total, 'Tax: ' || (v_item->>'description'));
                               v_total_credit := v_total_credit + v_tax_total;
                            END IF;
                        END IF;
                    END LOOP;
                END;

                v_total_debit := ROUND(v_total_debit, 2);
                v_total_credit := ROUND(v_total_credit, 2);
                IF v_total_debit != v_total_credit THEN
                    IF EXISTS(SELECT 1 FROM docs_journal_lines WHERE journal_id = v_journal_id AND id LIKE '%-rev-%') THEN
                        UPDATE docs_journal_lines 
                        SET credit = ROUND(credit + (v_total_debit - v_total_credit), 2)
                        WHERE id = (SELECT id FROM docs_journal_lines WHERE journal_id = v_journal_id AND id LIKE '%-rev-%' ORDER BY credit DESC LIMIT 1);
                        v_total_credit := v_total_debit;
                    ELSE
                        RAISE EXCEPTION 'Invoice Failed: Unbalanced Invoice (Dr: %, Cr: %). Diff: %', v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
                    END IF;
                END IF;

                UPDATE docs_journals SET status = 'POSTED', updated_at = NOW() WHERE id = v_journal_id;

                -- FIX: Set invoice status to POSTED explicitly before cash sale logic evaluates
                UPDATE docs_invoices SET status = 'POSTED', data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', to_jsonb('POSTED'::text)) WHERE id = p_invoice_id AND status = 'DRAFT';

                -- Cash Sale Auto Payment Logic (when first posted)
                v_is_cash_sale := COALESCE(v_invoice.customer_id, '') ILIKE '%cash-sale%' OR EXISTS(SELECT 1 FROM docs_contacts WHERE id = v_invoice.customer_id AND (name ILIKE '%cash sale%' OR name ILIKE '%cash-sale%'));
                IF v_is_cash_sale AND NOT EXISTS (
                    SELECT 1 FROM docs_payments p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'appliedInvoices') = 'array' THEN p.data->'appliedInvoices' ELSE '[]'::jsonb END) AS app
                    WHERE p.id <> 'PAY-AUTO-' || p_invoice_id AND p.status = 'POSTED' AND app->>'invoiceId' = p_invoice_id
                ) THEN
                    SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE code IN ('1011', '100100', '100101', 'CASH', 'BANK') AND company_id = v_effective_company_id LIMIT 1;
                    IF v_liquidity_acc IS NULL THEN SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE (name ILIKE '%cash%' OR name ILIKE '%bank%') AND company_id = v_effective_company_id LIMIT 1; END IF;
                    IF v_liquidity_acc IS NULL THEN SELECT id INTO v_liquidity_acc FROM docs_accounts WHERE type = 'ASSET' AND company_id = v_effective_company_id LIMIT 1; END IF;
                    
                    v_pay_id := 'PAY-AUTO-' || p_invoice_id;
                    INSERT INTO docs_payments (id, company_id, date, contact_id, status, type, amount, payment_date, applied_invoices, data, updated_at)
                    VALUES (
                        v_pay_id, v_effective_company_id, v_invoice.date, v_invoice.customer_id, 'DRAFT', 'RECEIPT', COALESCE(v_invoice.total, 0), v_invoice.date, jsonb_build_array(jsonb_build_object('invoiceId', p_invoice_id, 'invoiceNumber', COALESCE(v_invoice.invoice_number, '(DRAFT)'), 'amount', COALESCE(v_invoice.total, 0), 'remaining', 0)),
                        jsonb_build_object(
                            'id', v_pay_id, 'amount', COALESCE(v_invoice.total, 0),
                            'contactId', v_invoice.customer_id, 'date', v_invoice.date, 'method', 'CASH', 'type', 'RECEIPT',
                            'accountId', v_liquidity_acc, 'status', 'DRAFT', 'companyId', v_effective_company_id,
                            'appliedInvoices', jsonb_build_array(jsonb_build_object('invoiceId', p_invoice_id, 'invoiceNumber', COALESCE(v_invoice.invoice_number, '(DRAFT)'), 'amount', COALESCE(v_invoice.total, 0), 'remaining', 0))
                        ),
                        NOW()
                    ) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, applied_invoices = EXCLUDED.applied_invoices, date = EXCLUDED.date, payment_date = EXCLUDED.payment_date, amount = EXCLUDED.amount, type = EXCLUDED.type, updated_at = NOW();
                    
                    PERFORM post_payment(v_pay_id, v_effective_company_id);
                    
                    UPDATE docs_invoices SET status = 'PAID', data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', to_jsonb('PAID'::text)) WHERE id = p_invoice_id;
                END IF;

                RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
            END;
$$;
`;

async function run() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(sql);
  console.log("Updated RPC function post_invoice successfully!");
  process.exit();
}
run();
