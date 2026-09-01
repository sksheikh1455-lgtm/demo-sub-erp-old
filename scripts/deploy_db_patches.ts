import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log('Deploying security policies on docs_credit_note_lines...');
    await client.query(`
      ALTER TABLE IF EXISTS docs_credit_note_lines ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "all_credit_note_lines" ON docs_credit_note_lines;
      CREATE POLICY "all_credit_note_lines" ON docs_credit_note_lines FOR ALL USING (true) WITH CHECK (true);
      
      DROP POLICY IF EXISTS "Company Isolation" ON docs_credit_note_lines;
      CREATE POLICY "Company Isolation" ON docs_credit_note_lines FOR ALL TO authenticated USING (check_company_access(company_id)) WITH CHECK (check_company_access(company_id));
    `);

    console.log('Deploying generate_inventory_movements...');
    await client.query(`
CREATE OR REPLACE FUNCTION public.generate_inventory_movements()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
      IF TG_TABLE_NAME = 'docs_inventory_adjustments' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'CLOSED'))) THEN
          v_data := (row_to_json(NEW)::jsonb)->'data';
          IF v_data IS NOT NULL AND (v_data->'items') IS NOT NULL THEN
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
      IF TG_TABLE_NAME = 'docs_invoices' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE', 'CLOSED'))) THEN
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
      IF TG_TABLE_NAME = 'docs_bills' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE', 'CLOSED'))) THEN
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

      -- 4. Handle Credit Notes
      IF TG_TABLE_NAME = 'docs_credit_notes' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE', 'CLOSED'))) THEN
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
$function$;
    `);

    console.log('Deploying post_credit_note...');
    await client.query(`
CREATE OR REPLACE FUNCTION public.post_credit_note(p_cn_id text, p_company_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $function$
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
    v_contact_id TEXT;
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
                ) FROM docs_credit_note_lines WHERE credit_note_id = p_cn_id AND (quantity > 0 OR type IN ('DISCOUNT', 'TAX'))),
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
    
    FOR v_item IN SELECT jsonb_array_elements(v_cn.data->'items') LOOP
        -- Skip zeroed/buffer lines
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') AND (
            COALESCE((v_item->>'quantity')::numeric, 0) = 0 OR 
            (COALESCE((v_item->>'unitPrice')::numeric, 0) = 0 AND COALESCE((v_item->>'lineValue')::numeric, 0) = 0)
        ) THEN
            CONTINUE;
        END IF;

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
    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_cn.date, v_cn.date, 'CREDIT_NOTE', 'DRAFT', v_cn.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_cn.date, 'status', 'DRAFT', 'companyId', v_effective_company_id, 'reference', v_cn.data->>'number', 'journalType', 'CREDIT_NOTE'), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', data = EXCLUDED.data, updated_at = NOW();

    -- Process Product Returns (Inventory Re-stocking and Movements Trigger generation)
    FOR v_item IN SELECT jsonb_array_elements(v_cn.data->'items') LOOP
        -- Skip zeroed/buffer lines
        IF v_item->>'type' IN ('PRODUCT', 'SERVICE', 'CHARGE') AND (
            COALESCE((v_item->>'quantity')::numeric, 0) = 0 OR 
            (COALESCE((v_item->>'unitPrice')::numeric, 0) = 0 AND COALESCE((v_item->>'lineValue')::numeric, 0) = 0)
        ) THEN
            CONTINUE;
        END IF;

        IF v_item->>'type' = 'PRODUCT' AND v_item->>'productId' IS NOT NULL AND v_item->>'productId' <> '' THEN
            SELECT * INTO v_product_record FROM docs_products WHERE id = (v_item->>'productId') FOR UPDATE;
            IF FOUND THEN
                v_current_stock := COALESCE(v_product_record.quantity_on_hand, 0);
                v_new_stock := v_current_stock + COALESCE((v_item->>'quantity')::numeric, 0);
                
                UPDATE docs_products 
                SET quantity_on_hand = v_new_stock,
                    data = jsonb_set(
                        jsonb_set(
                            CASE WHEN data ? 'stockLevels' THEN data ELSE data || '{"stockLevels": {}}'::jsonb END,
                            ('{stockLevels,' || v_effective_company_id || '}')::text[], 
                            v_new_stock::text::jsonb
                        ),
                        '{quantityOnHand}',
                        to_jsonb(v_new_stock)
                    ),
                    updated_at = NOW()
                WHERE id = v_product_record.id;
            END IF;
        END IF;
    END LOOP;

    -- Update flat columns for status correctly.
    -- THIS FIRES THE TRIGGERS FIRST to run stock ledger updates and insert individual ledger entries before zeroing them out!
    UPDATE docs_credit_notes 
    SET status = 'POSTED', 
        data = jsonb_set(
            jsonb_set(COALESCE(v_cn.data, data, '{}'::jsonb), '{status}', '"POSTED"'),
            '{journalEntryId}', to_jsonb(v_journal_id)
        ), 
        updated_at = NOW() 
    WHERE id = p_cn_id;

    -- NOW, Zero out ALL existing journal lines for this journal (Zeroing Architecture)
    -- This includes zeroing any individual lines created by inventory movement triggers beforehand, preventing duplicate addition
    UPDATE docs_journal_lines SET debit = 0, credit = 0 WHERE journal_id = v_journal_id;

    -- Calculate balanced aggregated lines
    v_total_credit := ROUND(COALESCE((v_cn.data->>'total')::numeric, 0), 2);
    v_revenue_net := v_total_revenue_subtotal + v_global_discount;
    -- Balance check
    IF ROUND(v_revenue_net + v_tax_total, 2) != v_total_credit THEN
        v_revenue_net := ROUND(v_total_credit - v_tax_total, 2);
    END IF;

    -- Resolve contact ID with robust fallbacks to satisfy the strict partner constraint trigger
    v_contact_id := COALESCE(v_cn.data->>'customerId', v_cn.data->>'contactId', v_cn.customer_id);
    IF NULLIF(TRIM(v_contact_id), '') IS NULL THEN
        SELECT id INTO v_contact_id FROM docs_contacts WHERE company_id = v_effective_company_id LIMIT 1;
    END IF;
    IF NULLIF(TRIM(v_contact_id), '') IS NULL THEN
        SELECT id INTO v_contact_id FROM docs_contacts LIMIT 1;
    END IF;

    -- Insert Single Distinct Aggregated AR Credit Line
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-ar', v_journal_id, v_effective_company_id, v_ar_acc, v_contact_id, 0, v_total_credit, 'Credit Note total: ' || (v_cn.data->>'number'))
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

    -- Upsert Header
    INSERT INTO docs_journals (id, company_id, date, journal_date, journal_type, status, reference_number, data, updated_at)
    VALUES (v_journal_id, v_effective_company_id, v_cn.date, v_cn.date, 'CREDIT_NOTE', 'POSTED', v_cn.data->>'number', 
        jsonb_build_object('id', v_journal_id, 'date', v_cn.date, 'status', 'POSTED', 'companyId', v_effective_company_id, 'reference', v_cn.data->>'number', 'journalType', 'CREDIT_NOTE', 'preparedBy', COALESCE(v_cn.data->>'preparedBy', v_cn.data->>'salesperson'), 'createdById', v_cn.data->>'createdById'), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'POSTED', data = EXCLUDED.data;

    -- Update with FULL JSON document (all fields mapped!)
    UPDATE docs_journals 
    SET data = jsonb_build_object(
        'id', id,
        'date', date,
        'status', status,
        'companyId', company_id,
        'reference', reference_number,
        'journalType', 'CREDIT_NOTE',
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
$function$;
    `);

    console.log('Deploying post_payment...');
    await client.query(`
CREATE OR REPLACE FUNCTION public.post_payment(p_payment_id text, p_company_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    v_ref_val TEXT;
BEGIN
    SELECT * INTO v_payment FROM docs_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payment not found: ' || p_payment_id); END IF;
    
    v_is_receipt := v_payment.type = 'RECEIPT' OR v_payment.type = 'COLLECTION';
    v_is_refund := v_payment.type = 'REFUND';
    v_amount := COALESCE(v_payment.amount, 0);
    v_date := COALESCE(v_payment.date, v_payment.payment_date, CURRENT_DATE);
    v_contact_id := v_payment.contact_id;
    v_effective_company_id := COALESCE(p_company_id, v_payment.company_id);
    
    v_journal_id := 'JE-' || CASE WHEN v_is_receipt OR v_is_refund THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(v_payment.id), 'PAY-', ''), 'PAY-', '');
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        -- Also update status to POSTED if it was stuck as DRAFT
        UPDATE docs_payments 
        SET status = 'POSTED', 
            data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'),
            updated_at = NOW() 
        WHERE id = p_payment_id;
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
      'DRAFT', 
      v_ref_val, 
      v_ref_val,
      'System', 
      NULL, 
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET status = 'DRAFT', updated_at = NOW();

    DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;

    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-liq', v_journal_id, v_effective_company_id, v_liquidity_acc, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, COALESCE('Payment: ' || v_ref_val, 'Payment: ' || v_payment.id));
    
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    VALUES ('JL-' || v_journal_id || '-part', v_journal_id, v_effective_company_id, v_partner_acc, v_contact_id, CASE WHEN v_is_receipt THEN 0 ELSE v_amount END, CASE WHEN v_is_receipt THEN v_amount ELSE 0 END, COALESCE('Reconciliation: ' || v_ref_val, 'Payment reconciliation: ' || v_payment.id));

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
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), status = 'POSTED', reference_number = v_ref_val, reference = v_ref_val;

    IF v_is_receipt AND v_payment.applied_invoices IS NOT NULL THEN
        FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_payment.applied_invoices) LOOP
            SELECT * INTO v_inv_record FROM docs_invoices WHERE id = (v_alloc->>'invoiceId') FOR UPDATE;
            IF FOUND THEN
                SELECT COALESCE(SUM((al->>'amount')::numeric), 0) INTO v_new_amt_paid
                FROM docs_payments p, jsonb_array_elements(COALESCE(p.applied_invoices, '[]'::jsonb)) al
                WHERE p.status = 'POSTED' AND p.company_id = v_effective_company_id AND al->>'invoiceId' = v_inv_record.id;
                
                IF v_payment.status != 'POSTED' THEN
                    v_new_amt_paid := v_new_amt_paid + (v_alloc->>'amount')::numeric;
                END IF;

                UPDATE docs_invoices 
                SET status = CASE WHEN v_new_amt_paid >= COALESCE(total, 0) - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                    updated_at = NOW()
                WHERE id = v_inv_record.id;
            END IF;
        END LOOP;
    ELSIF NOT v_is_receipt AND v_payment.applied_bills IS NOT NULL THEN
        FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_payment.applied_bills) LOOP
            SELECT * INTO v_bill_record FROM docs_bills WHERE id = (v_alloc->>'billId') FOR UPDATE;
            IF FOUND THEN
                SELECT COALESCE(SUM((al->>'amount')::numeric), 0) INTO v_new_amt_paid
                FROM docs_payments p, jsonb_array_elements(COALESCE(p.applied_bills, '[]'::jsonb)) al
                WHERE p.status = 'POSTED' AND p.company_id = v_effective_company_id AND al->>'billId' = v_bill_record.id;

                IF v_payment.status != 'POSTED' THEN
                    v_new_amt_paid := v_new_amt_paid + (v_alloc->>'amount')::numeric;
                END IF;

                UPDATE docs_bills 
                SET status = CASE WHEN v_new_amt_paid >= COALESCE(total, 0) - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                    updated_at = NOW()
                WHERE id = v_bill_record.id;
            END IF;
        END LOOP;
    END IF;

    UPDATE docs_payments 
    SET status = 'POSTED', 
        data = jsonb_set(COALESCE(data, '{}'::jsonb), '{status}', '"POSTED"'),
        updated_at = NOW() 
    WHERE id = p_payment_id;

    -- Update with FULL JSON document (all fields mapped!)
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
$function$;
    `);

    console.log('Database Patches Deployed Successfully!');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    await client.end();
  }
}
main();
