import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Replacing generate_inventory_movements trigger function definition with a robust version...");

  const sql = `
  CREATE OR REPLACE FUNCTION generate_inventory_movements() RETURNS TRIGGER AS $$
    DECLARE
      item RECORD;
      adj_item JSONB;
      v_wh_id TEXT;
      v_is_posted BOOLEAN;
      v_tx_cost NUMERIC;
      v_data JSONB;
    BEGIN
      -- Recursion guard
      IF pg_trigger_depth() > 3 THEN RETURN NEW; END IF;

      -- Status check for inventory impact
      v_is_posted := NEW.status IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN');

      -- 1. Handle inventory adjustments (which still have 'data' column)
      IF TG_TABLE_NAME = 'docs_inventory_adjustments' AND (v_is_posted AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN'))) THEN
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
      IF TG_TABLE_NAME = 'docs_invoices' AND (v_is_posted AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE'))) THEN
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
      IF TG_TABLE_NAME = 'docs_bills' AND (v_is_posted AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE'))) THEN
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
      IF TG_TABLE_NAME = 'docs_credit_notes' AND (v_is_posted AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE'))) THEN
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
  $$ LANGUAGE plpgsql;
  `;

  await client.query(sql);
  console.log("Successfully replaced generate_inventory_movements trigger function!");

  // Now, drop the obsolete overloads of allocate_payment_to_invoice and process_payment_and_allocate
  console.log("Dropping obsolete function overloads...");
  await client.query("DROP FUNCTION IF EXISTS public.allocate_payment_to_invoice(text, text, numeric, text);");
  await client.query("DROP FUNCTION IF EXISTS public.allocate_payment_to_invoice(text, text, text, numeric);");
  console.log("Successfully dropped allocate_payment_to_invoice overloads!");

  await client.query("DROP FUNCTION IF EXISTS public.process_payment_and_allocate(jsonb, jsonb, text);");
  console.log("Successfully dropped process_payment_and_allocate overload!");

  await client.end();
}
run();
