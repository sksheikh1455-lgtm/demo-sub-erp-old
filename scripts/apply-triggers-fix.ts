import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('=== STARTING TRIGGER AND RPC FIX APPLICATION ===');

  // 1. Fix generate_document_numbers
  console.log('Updating trigger function: generate_document_numbers...');
  await client.query(`
    CREATE OR REPLACE FUNCTION generate_document_numbers()
    RETURNS TRIGGER AS $$
    DECLARE
      v_field TEXT;
      v_seq TEXT;
      v_cid TEXT;
      v_num TEXT;
      v_status TEXT;
      v_current_doc_num TEXT;
    BEGIN
      v_cid := (to_jsonb(NEW) ->> 'company_id');
      v_status := (to_jsonb(NEW) ->> 'status');

      IF TG_TABLE_NAME = 'docs_invoices' THEN v_seq := 'INVOICE'; v_current_doc_num := NEW.invoice_number;
      ELSIF TG_TABLE_NAME = 'docs_bills' THEN v_seq := 'BILL'; v_current_doc_num := NEW.bill_number;
      ELSIF TG_TABLE_NAME = 'docs_payments' THEN v_seq := 'PAYMENT'; v_current_doc_num := NEW.payment_number;
      ELSIF TG_TABLE_NAME = 'docs_journals' THEN
         IF (to_jsonb(NEW) ->> 'journal_type') = 'EXPENSE' THEN
            v_seq := 'EXPENSE';
         ELSE
            v_seq := 'JOURNAL';
         END IF;
         v_current_doc_num := NEW.reference_number;
      ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN v_seq := 'CREDIT_NOTE'; v_current_doc_num := NEW.credit_note_number;
      ELSIF TG_TABLE_NAME = 'docs_loans' THEN v_seq := 'LOAN'; v_current_doc_num := NEW.loan_number;
      ELSIF TG_TABLE_NAME = 'docs_products' THEN v_seq := 'PRODUCT'; v_current_doc_num := NEW.sku;
      ELSIF TG_TABLE_NAME = 'docs_contacts' THEN v_seq := 'CONTACT'; v_current_doc_num := NEW.external_id;
      END IF;

      IF (v_status IS NULL OR v_status IN ('POSTED', 'PAID', 'PARTIAL', 'ACTIVE', 'OPEN')) AND 
         (v_current_doc_num IS NULL OR v_current_doc_num = '' OR v_current_doc_num LIKE 'DRAFT-%') THEN
        IF v_cid IS NOT NULL THEN
           v_num := get_next_company_doc_number(v_cid, v_seq);
           
           IF TG_TABLE_NAME = 'docs_invoices' THEN 
              NEW.invoice_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_bills' THEN 
              NEW.bill_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_payments' THEN 
              NEW.payment_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_journals' THEN 
              NEW.reference_number := v_num;
              IF NEW.data IS NOT NULL THEN 
                 NEW.data := jsonb_set(jsonb_set(NEW.data, '{reference}', to_jsonb(v_num)), '{reference_number}', to_jsonb(v_num));
              END IF;
           ELSIF TG_TABLE_NAME = 'docs_credit_notes' THEN 
              NEW.credit_note_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_loans' THEN 
              NEW.loan_number := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{number}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_products' THEN 
              NEW.sku := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{sku}', to_jsonb(v_num)); END IF;
           ELSIF TG_TABLE_NAME = 'docs_contacts' THEN 
              NEW.external_id := v_num;
              IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{externalId}', to_jsonb(v_num)); END IF;
           END IF;
        END IF;
      END IF;

      IF TG_TABLE_NAME = 'docs_journals' THEN
         IF NEW.journal_number IS NULL OR NEW.journal_number LIKE 'DRAFT-%' THEN
            NEW.journal_number := COALESCE(NEW.reference_number, NEW.id, 'JE-TMP');
            IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{journal_number}', to_jsonb(NEW.journal_number)); END IF;
         END IF;
         IF NEW.reference_number IS NULL THEN
            NEW.reference_number := NEW.journal_number;
            IF NEW.data IS NOT NULL THEN NEW.data := jsonb_set(NEW.data, '{reference_number}', to_jsonb(NEW.reference_number)); END IF;
         END IF;
         IF NEW.journal_date IS NULL THEN
            NEW.journal_date := COALESCE(NEW.date, CURRENT_DATE);
         END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // 2. Fix generate_inventory_movements
  console.log('Updating trigger function: generate_inventory_movements...');
  await client.query(`
    CREATE OR REPLACE FUNCTION generate_inventory_movements()
    RETURNS TRIGGER AS $$
    DECLARE
      item RECORD;
      adj_item JSONB;
      v_wh_id TEXT;
      v_is_posted BOOLEAN;
      v_tx_cost NUMERIC;
      v_data JSONB;
      v_status_new TEXT;
      v_status_old TEXT;
    BEGIN
      -- Recursion guard
      IF pg_trigger_depth() > 3 THEN RETURN NEW; END IF;

      v_status_new := (to_jsonb(NEW) ->> 'status');
      IF v_status_new IS NULL AND TG_TABLE_NAME = 'docs_inventory_adjustments' THEN
         v_status_new := 'POSTED';
      END IF;

      IF TG_OP = 'UPDATE' THEN
         v_status_old := (to_jsonb(OLD) ->> 'status');
         IF v_status_old IS NULL AND TG_TABLE_NAME = 'docs_inventory_adjustments' THEN
            v_status_old := 'POSTED';
         END IF;
      ELSE
         v_status_old := NULL;
      END IF;

      -- Status check for inventory impact (CLOSED added for Credit Notes)
      v_is_posted := v_status_new IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'CLOSED');

      -- 1. Handle inventory adjustments (which still have 'data' column)
      IF TG_TABLE_NAME = 'docs_inventory_adjustments' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN'))) THEN
          v_data := (row_to_json(NEW)::jsonb)->'data';
          IF v_data IS NOT NULL AND jsonb_typeof(v_data->'items') = 'array' THEN
            FOR adj_item IN SELECT * FROM jsonb_array_elements(v_data->'items') LOOP
              v_wh_id := COALESCE(adj_item->>'warehouseId', v_data->>'warehouseId', 'wh-' || NEW.company_id);
              INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price)
              VALUES (
                'mov-adj-' || NEW.id || '-' || COALESCE(adj_item->>'productId', md5(adj_item::text)), 
                NEW.company_id, 
                adj_item->>'productId', 
                v_wh_id, 
                CASE WHEN (adj_item->>'difference')::NUMERIC >= 0 THEN 'IN' ELSE 'OUT' END, 
                ABS((adj_item->>'difference')::NUMERIC), 
                NEW.id, 
                'ADJUSTMENT', 
                COALESCE((v_data->>'date')::DATE, NEW.updated_at::DATE, NOW()::DATE), 
                COALESCE((adj_item->>'costPrice')::NUMERIC, (SELECT cost_price FROM docs_products WHERE id = adj_item->>'productId'), 0)
              )
              ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
            END LOOP;
          END IF;
      END IF;

      -- 2. Handle Invoices
      IF TG_TABLE_NAME = 'docs_invoices' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE'))) THEN
        FOR item IN SELECT * FROM docs_invoice_lines WHERE invoice_id = NEW.id LOOP
          IF item.product_id IS NOT NULL AND item.product_id <> '' THEN
            v_wh_id := 'wh-' || NEW.company_id;
            
            SELECT avg_cost INTO v_tx_cost FROM docs_product_costs 
            WHERE product_id = item.product_id AND warehouse_id = v_wh_id AND company_id = NEW.company_id;
            
            IF v_tx_cost IS NULL THEN
               SELECT cost_price INTO v_tx_cost FROM docs_products WHERE id = item.product_id;
            END IF;
            IF v_tx_cost IS NULL THEN v_tx_cost := 0; END IF;

            INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, unit_price)
            VALUES (
              'mov-inv-' || NEW.id || '-' || item.id,
              NEW.company_id,
              item.product_id,
              v_wh_id,
              'OUT',
              COALESCE(item.quantity, 0),
              NEW.id,
              'INVOICE',
              COALESCE(NEW.date, NOW()::DATE),
              v_tx_cost,
              COALESCE(item.unit_price, 0)
            ) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
          END IF;
        END LOOP;
      END IF;

      -- 3. Handle Bills
      IF TG_TABLE_NAME = 'docs_bills' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE'))) THEN
        FOR item IN SELECT * FROM docs_bill_lines WHERE bill_id = NEW.id LOOP
          IF item.product_id IS NOT NULL AND item.product_id <> '' THEN
            v_wh_id := 'wh-' || NEW.company_id;
            
            v_tx_cost := COALESCE(item.unit_price, 0);

            INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, unit_price)
            VALUES (
              'mov-bil-' || NEW.id || '-' || item.id,
              NEW.company_id,
              item.product_id,
              v_wh_id,
              'IN',
              COALESCE(item.quantity, 0),
              NEW.id,
              'BILL',
              COALESCE(NEW.date, NOW()::DATE),
              v_tx_cost,
              COALESCE(item.unit_price, 0)
            ) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
          END IF;
        END LOOP;
      END IF;

      -- 4. Hande Credit Notes
      IF TG_TABLE_NAME = 'docs_credit_notes' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE'))) THEN
        FOR item IN SELECT * FROM docs_credit_note_lines WHERE credit_note_id = NEW.id LOOP
          IF item.product_id IS NOT NULL AND item.product_id <> '' THEN
            v_wh_id := 'wh-' || NEW.company_id;
            
            SELECT avg_cost INTO v_tx_cost FROM docs_product_costs 
            WHERE product_id = item.product_id AND warehouse_id = v_wh_id AND company_id = NEW.company_id;
            
            IF v_tx_cost IS NULL THEN
               SELECT cost_price INTO v_tx_cost FROM docs_products WHERE id = item.product_id;
            END IF;
            IF v_tx_cost IS NULL THEN v_tx_cost := 0; END IF;

            INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, unit_price)
            VALUES (
              'mov-cn-' || NEW.id || '-' || item.id,
              NEW.company_id,
              item.product_id,
              v_wh_id,
              'IN',
              COALESCE(item.quantity, 0),
              NEW.id,
              'CREDIT_NOTE',
              COALESCE(NEW.date, NOW()::DATE),
              v_tx_cost,
              COALESCE(item.unit_price, 0)
            ) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
          END IF;
        END LOOP;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // 3. Fix post_invoice to check already PAID state
  console.log('Updating stored function: post_invoice...');
  await client.query(`
    CREATE OR REPLACE FUNCTION post_invoice(p_invoice_id TEXT, p_company_id TEXT DEFAULT NULL)
    RETURNS JSONB AS $$
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
        IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id AND status = 'POSTED') THEN 
            RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
        END IF;

        v_effective_company_id := COALESCE(p_company_id, v_invoice.company_id);
        IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

        SELECT id INTO v_ar_acc FROM docs_accounts WHERE code IN ('100201', '100200') AND company_id = v_effective_company_id LIMIT 1;
        IF v_ar_acc IS NULL THEN
            SELECT id INTO v_ar_acc FROM docs_accounts WHERE (data->>'subType' = 'RECEIVABLE' OR data->>'type' = 'ASSET') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_ar_acc IS NULL THEN
            SELECT id INTO v_ar_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_rev_acc FROM docs_accounts WHERE code IN ('400100', '400000') AND company_id = v_effective_company_id LIMIT 1;
        IF v_rev_acc IS NULL THEN
            SELECT id INTO v_rev_acc FROM docs_accounts WHERE (data->>'subType' = 'REVENUE' OR data->>'type' = 'REVENUE' OR data->>'type' = 'INCOME') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_rev_acc IS NULL THEN
            SELECT id INTO v_rev_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100') AND company_id = v_effective_company_id LIMIT 1;
        IF v_cogs_acc IS NULL THEN
            SELECT id INTO v_cogs_acc FROM docs_accounts WHERE (data->>'subType' = 'COGS' OR data->>'type' = 'EXPENSE') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_cogs_acc IS NULL THEN
            SELECT id INTO v_cogs_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_inv_acc FROM docs_accounts WHERE code IN ('100501', '100502', '100500') AND company_id = v_effective_company_id LIMIT 1;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE (data->>'subType' = 'INVENTORY' OR data->>'type' = 'ASSET') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200400' AND company_id = v_effective_company_id LIMIT 1;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE (data->>'subType' = 'TAX' OR data->>'type' = 'LIABILITY') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
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

                            v_cogs_value := ROUND(COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE(v_product_record.cost_price, 0), 2);
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
        v_is_cash_sale := COALESCE(v_invoice.customer_id, '') ILIKE '%cash-sale%' OR EXISTS(SELECT 1 FROM docs_contacts WHERE id = v_invoice.customer_id AND (name ILIKE '%cash sale%' OR name ILIKE '%cash-sale%'));
        IF v_is_cash_sale AND NOT EXISTS (
            SELECT 1 FROM docs_payments p, jsonb_array_elements(CASE WHEN jsonb_typeof(p.data->'appliedInvoices') = 'array' THEN p.data->'appliedInvoices' ELSE '[]'::jsonb END) AS app
            WHERE p.id <> 'PAY-AUTO-' || p_invoice_id AND p.status = 'POSTED' AND app->>'invoiceId' = p_invoice_id
        ) THEN
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
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // 4. Fix post_bill to check already PAID state
  console.log('Updating stored function: post_bill...');
  await client.query(`
    CREATE OR REPLACE FUNCTION post_bill(p_bill_id TEXT, p_company_id TEXT DEFAULT NULL)
    RETURNS JSONB AS $$
    DECLARE
        v_bill RECORD;
        v_item RECORD;
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
        
        v_journal_id := 'JE-' || replace(UPPER(v_bill.id), 'BILL-', '');
        IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id AND status = 'POSTED') THEN 
            RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
        END IF;

        v_effective_company_id := COALESCE(p_company_id, v_bill.company_id);
        IF v_effective_company_id IS NULL THEN RAISE EXCEPTION 'Company ID missing'; END IF;

        -- 2. Resolve Accounts with safe fallbacks
        SELECT id INTO v_ap_acc FROM docs_accounts WHERE code IN ('200101', '200100', '200201', '2100') AND company_id = v_effective_company_id LIMIT 1;
        IF v_ap_acc IS NULL THEN
            SELECT id INTO v_ap_acc FROM docs_accounts WHERE (data->>'subType' = 'PAYABLE' OR data->>'type' = 'LIABILITY') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_ap_acc IS NULL THEN
            SELECT id INTO v_ap_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_inv_acc FROM docs_accounts WHERE code IN ('100501', '100502', '100500') AND company_id = v_effective_company_id LIMIT 1;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE (data->>'subType' = 'INVENTORY' OR data->>'type' = 'ASSET') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_inv_acc IS NULL THEN
            SELECT id INTO v_inv_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_exp_acc FROM docs_accounts WHERE code IN ('500101', '500100', '600100') AND company_id = v_effective_company_id LIMIT 1;
        IF v_exp_acc IS NULL THEN
            SELECT id INTO v_exp_acc FROM docs_accounts WHERE (data->>'subType' = 'EXPENSE' OR data->>'type' = 'EXPENSE') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_exp_acc IS NULL THEN
            SELECT id INTO v_exp_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        SELECT id INTO v_tax_acc FROM docs_accounts WHERE code = '200400' AND company_id = v_effective_company_id LIMIT 1;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE (data->>'subType' = 'TAX' OR data->>'type' = 'LIABILITY') AND company_id = v_effective_company_id LIMIT 1;
        END IF;
        IF v_tax_acc IS NULL THEN
            SELECT id INTO v_tax_acc FROM docs_accounts WHERE company_id = v_effective_company_id LIMIT 1;
        END IF;

        -- 3. Calculate Global Totals for Proportional Distribution & Balancing
        v_total_revenue_subtotal := 0;
        v_global_discount := 0;
        v_tax_total := 0;
        
        FOR v_item IN SELECT * FROM docs_bill_lines WHERE bill_id = p_bill_id LOOP
            IF v_item.type IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                v_net_cost := ROUND(COALESCE(v_item.line_value, 0), 2);
                IF v_net_cost = 0 THEN
                    v_net_cost := COALESCE(v_item.quantity, 0) * COALESCE(v_item.unit_price, 0);
                    IF v_item.discount_mode = 'FIXED' THEN
                        v_net_cost := v_net_cost - COALESCE(v_item.discount_rate, 0);
                    ELSE
                        v_net_cost := v_net_cost * (1 - COALESCE(v_item.discount_rate, 0) / 100);
                    END IF;
                    v_net_cost := ROUND(v_net_cost, 2);
                END IF;
                v_total_revenue_subtotal := v_total_revenue_subtotal + v_net_cost;
            ELSIF v_item.type = 'DISCOUNT' THEN
                v_net_cost := ROUND(COALESCE(v_item.line_value, 0), 2);
                IF v_net_cost = 0 THEN
                    IF v_item.discount_mode = 'FIXED' THEN
                        v_net_cost := -ROUND(COALESCE(v_item.discount_rate, 0), 2);
                    ELSE
                        v_net_cost := -ROUND(v_total_revenue_subtotal * COALESCE(v_item.discount_rate, 0) / 100.0, 2);
                    END IF;
                END IF;
                v_global_discount := v_global_discount + v_net_cost;
            ELSIF v_item.type = 'TAX' THEN
                v_net_cost := ROUND(COALESCE(v_item.line_value, 0), 2);
                IF v_net_cost = 0 THEN
                   v_net_cost := ROUND((v_total_revenue_subtotal + v_global_discount) * (COALESCE(v_item.discount_rate, 0)/100.0), 2);
                END IF;
                v_tax_total := v_tax_total + v_net_cost;
            END IF;
        END LOOP;

        -- 4. Finalize Bill Status First
        UPDATE docs_bills 
        SET status = CASE WHEN status IN ('PAID', 'PARTIALLY_PAID', 'PARTIAL', 'IN_PAYMENT') THEN status ELSE 'POSTED' END, 
            updated_at = NOW() 
        WHERE id = p_bill_id 
        RETURNING * INTO v_bill;

        -- Ensure we don't hit unq_journal_num_company if another ID has this reference
        SELECT id INTO v_journal_id FROM docs_journals WHERE company_id = v_effective_company_id AND reference_number = v_bill.bill_number LIMIT 1;
        IF v_journal_id IS NULL THEN
            v_journal_id := 'JE-' || replace(replace(UPPER(v_bill.id), 'BIL-', ''), 'BILL-', '');
        END IF;

        -- Pre-create Journal Header as DRAFT to satisfy FK and ignore balance trigger
        INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, updated_at, reference, description)
        VALUES (v_journal_id, v_effective_company_id, v_bill.date, v_bill.date, 'BILL', 'DRAFT', v_bill.bill_number, NOW(), v_bill.reference, COALESCE(v_bill.data->>'description', v_bill.reference, 'Bill ' || v_bill.bill_number))
        ON CONFLICT (id) DO UPDATE SET 
            status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END,
            updated_at = NOW();

        DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

        -- AP Line (Total)
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES ('JL-' || v_journal_id || '-ap', v_journal_id, v_effective_company_id, v_ap_acc, v_bill.vendor_id, 0, ROUND(COALESCE(v_bill.total, 0), 2), 'AP: ' || COALESCE(v_bill.bill_number, '(DRAFT)'));
        v_total_credit := ROUND(COALESCE(v_bill.total, 0), 2);

        -- Items
        DECLARE
            v_discount_distributed NUMERIC := 0;
            v_items_count INT := 0;
            v_current_item_idx INT := 0;
        BEGIN
            SELECT count(*) INTO v_items_count FROM docs_bill_lines WHERE bill_id = p_bill_id AND type IN ('PRODUCT', 'SERVICE', 'CHARGE');

            FOR v_item IN SELECT * FROM docs_bill_lines WHERE bill_id = p_bill_id LOOP
                v_idx := v_idx + 1;
                
                IF v_item.type IN ('PRODUCT', 'SERVICE', 'CHARGE') THEN
                    v_current_item_idx := v_current_item_idx + 1;
                    
                    -- Calculate Gross for this line
                    v_net_cost := ROUND(COALESCE(v_item.line_value, 0), 2);
                    IF v_net_cost = 0 THEN
                        v_net_cost := COALESCE(v_item.quantity, 0) * COALESCE(v_item.unit_price, 0);
                        IF v_item.discount_mode = 'FIXED' THEN
                            v_net_cost := v_net_cost - COALESCE(v_item.discount_rate, 0);
                        ELSE
                            v_net_cost := v_net_cost * (1 - COALESCE(v_item.discount_rate, 0) / 100);
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

                    IF v_item.type = 'PRODUCT' THEN
                        -- Dr Inventory
                        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                        VALUES ('JL-' || v_journal_id || '-inv-' || v_idx, v_journal_id, v_effective_company_id, v_inv_acc, v_revenue_net, 0, 'Inv Val: ' || COALESCE(v_item.description, 'Item'));
                        v_total_debit := v_total_debit + v_revenue_net;

                        -- Update Stock & WAC (Using normalized quantity_on_hand!)
                        SELECT * INTO v_product_record FROM docs_products WHERE id = v_item.product_id FOR UPDATE;
                        IF FOUND THEN
                            v_current_stock := COALESCE(v_product_record.quantity_on_hand, 0);
                            v_old_cost := COALESCE(v_product_record.cost_price, 0);
                            v_new_stock := v_current_stock + COALESCE(v_item.quantity, 0);
                            
                            -- WAC Calculation
                            IF v_new_stock > 0 THEN
                               v_new_cost := ((v_current_stock * v_old_cost) + v_revenue_net) / v_new_stock;
                            ELSE
                               v_new_cost := v_old_cost;
                            END IF;

                            UPDATE docs_products 
                            SET quantity_on_hand = v_new_stock,
                                cost_price = v_new_cost,
                                last_purchase_price = COALESCE(v_item.unit_price, 0),
                                last_purchase_rate = COALESCE(v_item.unit_price, 0),
                                updated_at = NOW()
                            WHERE id = v_product_record.id;
                        END IF;
                    ELSIF v_item.type IN ('SERVICE', 'CHARGE') THEN
                        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                        VALUES ('JL-' || v_journal_id || '-exp-' || v_idx, v_journal_id, v_effective_company_id, v_exp_acc, v_revenue_net, 0, 'Exp: ' || COALESCE(v_item.description, 'Expense'));
                        v_total_debit := v_total_debit + v_revenue_net;
                    END IF;
                ELSIF v_item.type = 'TAX' THEN
                    v_tax_total := ROUND(COALESCE(v_item.line_value, 0), 2);
                    
                    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                    VALUES ('JL-' || v_journal_id || '-tax-' || v_idx, v_journal_id, v_effective_company_id, v_tax_acc, v_tax_total, 0, 'Tax: ' || COALESCE(v_item.description, 'Tax'));
                    v_total_debit := v_total_debit + v_tax_total;
                END IF;
            END LOOP;
        END;

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

        -- Upsert Header to POSTED
        INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, updated_at, reference, description)
        VALUES (v_journal_id, v_effective_company_id, v_bill.date, v_bill.date, 'BILL', 'POSTED', v_bill.bill_number, NOW(), v_bill.reference, COALESCE(v_bill.data->>'description', v_bill.reference, 'Bill ' || v_bill.bill_number))
        ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED';

        RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // 3. Update contact opening balance trigger to dynamically resolve accounts
  console.log('Updating trigger function: trg_generate_contact_opening_balance...');
  await client.query(`
    CREATE OR REPLACE FUNCTION trg_generate_contact_opening_balance()
    RETURNS TRIGGER AS $$
    DECLARE
      v_opening_balance NUMERIC;
      v_journal_id TEXT;
      v_acct_id_target TEXT;
      v_acct_id_equity TEXT;
      v_is_customer BOOLEAN;
    BEGIN
      v_opening_balance := COALESCE((NEW.data->>'openingBalance')::NUMERIC, 0);
      
      IF v_opening_balance > 0 THEN
        -- Check if an opening balance journal entry already exists for this contact to prevent duplicates
        IF EXISTS (
          SELECT 1 FROM docs_journals 
          WHERE company_id = NEW.company_id 
            AND (reference_number = 'OB-' || NEW.name OR reference_number LIKE 'INIT-%' || NEW.id || '%')
        ) THEN
          RETURN NEW;
        END IF;

        v_journal_id := 'JEN-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 6);
        v_is_customer := NEW.type = 'CUSTOMER';
        
        -- Resolve accounts dynamically
        IF v_is_customer THEN
          SELECT id INTO v_acct_id_target 
          FROM docs_accounts 
          WHERE company_id = NEW.company_id 
            AND (code = '100201' OR (data->>'subType' = 'ACCOUNTS_RECEIVABLE'))
          LIMIT 1;
          IF v_acct_id_target IS NULL THEN
            v_acct_id_target := NEW.company_id || '-100201';
          END IF;
        ELSE
          SELECT id INTO v_acct_id_target 
          FROM docs_accounts 
          WHERE company_id = NEW.company_id 
            AND (code = '200101' OR (data->>'subType' = 'ACCOUNTS_PAYABLE'))
          LIMIT 1;
          IF v_acct_id_target IS NULL THEN
            v_acct_id_target := NEW.company_id || '-200101';
          END IF;
        END IF;

        SELECT id INTO v_acct_id_equity 
        FROM docs_accounts 
        WHERE company_id = NEW.company_id 
          AND (code IN ('300100', '300200', '300000', '300001') OR (data->>'subType' = 'EQUITY'))
        LIMIT 1;
        IF v_acct_id_equity IS NULL THEN
          v_acct_id_equity := NEW.company_id || '-300100';
        END IF;
        
        INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data)
        VALUES (
          v_journal_id, 
          NEW.company_id, 
          CURRENT_DATE, 
          CURRENT_DATE,
          'OPENING_BALANCE', 
          'DRAFT', -- Insert as DRAFT first
          'OB-' || NEW.name, 
          jsonb_build_object(
            'id', v_journal_id,
            'companyId', NEW.company_id,
            'date', CURRENT_DATE,
            'journal_date', CURRENT_DATE,
            'journalType', 'OPENING_BALANCE',
            'status', 'DRAFT',
            'reference', 'OB-' || NEW.name,
            'description', 'Opening Balance for ' || NEW.name
          )
        );

        IF v_is_customer THEN
          -- Debit AR, Credit Equity
          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
          VALUES 
            ('JEL-' || extract(epoch from now())::text || '-1', v_journal_id, NEW.company_id, v_acct_id_target, NEW.id, v_opening_balance, 0, 'Opening Balance Receivable'),
            ('JEL-' || extract(epoch from now())::text || '-2', v_journal_id, NEW.company_id, v_acct_id_equity, NEW.id, 0, v_opening_balance, 'Opening Balance Equity');
        ELSE
          -- Debit Equity, Credit AP
          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
          VALUES 
            ('JEL-' || extract(epoch from now())::text || '-1', v_journal_id, NEW.company_id, v_acct_id_equity, NEW.id, v_opening_balance, 0, 'Opening Balance Equity'),
            ('JEL-' || extract(epoch from now())::text || '-2', v_journal_id, NEW.company_id, v_acct_id_target, NEW.id, 0, v_opening_balance, 'Opening Balance Payable');
        END IF;

        -- Now set it to POSTED
        UPDATE docs_journals SET status = 'POSTED', data = jsonb_set(data, '{status}', '"POSTED"') WHERE id = v_journal_id;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // 4. Update product opening balance trigger to dynamically resolve accounts
  console.log('Updating trigger function: trg_generate_product_opening_balance...');
  await client.query(`
    CREATE OR REPLACE FUNCTION trg_generate_product_opening_balance()
    RETURNS TRIGGER AS $$
    DECLARE
      v_qty NUMERIC;
      v_cost NUMERIC;
      v_total_value NUMERIC;
      v_journal_id TEXT;
      v_inv_account_id TEXT;
      v_eq_account_id TEXT;
    BEGIN
      v_qty := COALESCE((NEW.data->>'quantityOnHand')::NUMERIC, 0);
      v_cost := COALESCE(NEW.cost_price, (NEW.data->>'costPrice')::NUMERIC, 0);
      v_total_value := v_qty * v_cost;

      IF v_total_value > 0 THEN
        -- Check if an opening stock journal entry already exists for this SKU to prevent duplicates
        IF EXISTS (
          SELECT 1 FROM docs_journals 
          WHERE company_id = NEW.company_id 
            AND (reference_number = 'OB-' || NEW.sku OR reference_number LIKE 'INIT-%' || NEW.sku || '%')
        ) THEN
          RETURN NEW;
        END IF;

        v_journal_id := 'JEN-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 6);
        
        -- Resolve accounts dynamically
        SELECT id INTO v_inv_account_id 
        FROM docs_accounts 
        WHERE company_id = NEW.company_id 
          AND (code IN ('100501', '100502', '100500') OR (data->>'subType' = 'INVENTORY'))
        LIMIT 1;
        IF v_inv_account_id IS NULL THEN
          v_inv_account_id := NEW.company_id || '-100501';
        END IF;

        SELECT id INTO v_eq_account_id 
        FROM docs_accounts 
        WHERE company_id = NEW.company_id 
          AND (code IN ('300100', '300200', '300000', '300001') OR (data->>'subType' = 'EQUITY'))
        LIMIT 1;
        IF v_eq_account_id IS NULL THEN
          v_eq_account_id := NEW.company_id || '-300100';
        END IF;

        INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data)
        VALUES (
          v_journal_id, 
          NEW.company_id, 
          CURRENT_DATE, 
          CURRENT_DATE,
          'OPENING_BALANCE', 
          'DRAFT', -- DRAFT first
          'OB-' || NEW.sku, 
          jsonb_build_object(
            'id', v_journal_id,
            'companyId', NEW.company_id,
            'date', CURRENT_DATE,
            'journal_date', CURRENT_DATE,
            'journalType', 'OPENING_BALANCE',
            'status', 'DRAFT',
            'reference', 'OB-' || NEW.sku,
            'description', 'Opening Stock Entry for ' || NEW.name
          )
        );

        -- Debit Inventory Asset, Credit Equity
        INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
        VALUES 
          ('JEL-' || extract(epoch from now())::text || '-1', v_journal_id, NEW.company_id, v_inv_account_id, NULL, v_total_value, 0, 'Opening Stock Asset'),
          ('JEL-' || extract(epoch from now())::text || '-2', v_journal_id, NEW.company_id, v_eq_account_id, NULL, 0, v_total_value, 'Opening Stock Equity');
          
        -- Now set it to POSTED
        UPDATE docs_journals SET status = 'POSTED', data = jsonb_set(data, '{status}', '"POSTED"') WHERE id = v_journal_id;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log('=== TRG/RPC APPLICATION COMPLETED SUCCESSFULY ===');
  await client.end();
}
run().catch(console.error);
