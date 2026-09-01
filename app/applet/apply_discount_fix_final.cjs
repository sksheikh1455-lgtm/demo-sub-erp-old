const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
    CREATE OR REPLACE FUNCTION public.generate_inventory_movements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
    DECLARE
      item RECORD;
      adj_item JSONB;
      v_wh_id TEXT;
      v_is_posted BOOLEAN;
      v_tx_cost NUMERIC;
      v_data JSONB;
      v_status_new TEXT;
      v_status_old TEXT;
      v_bill_discount_factor NUMERIC := 1.0;
    BEGIN
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

      v_is_posted := v_status_new IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'CLOSED');

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

      IF TG_TABLE_NAME = 'docs_bills' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE', 'CLOSED'))) THEN
        IF COALESCE(NEW.subtotal, 0) > 0 THEN
           v_bill_discount_factor := ROUND((NEW.subtotal - COALESCE(NEW.discount_total, 0)) / NEW.subtotal, 4);
        ELSE
           v_bill_discount_factor := 1.0;
        END IF;

        FOR item IN SELECT * FROM docs_bill_lines WHERE bill_id = NEW.id LOOP
          IF item.product_id IS NOT NULL AND item.product_id <> '' THEN
            v_wh_id := 'wh-' || NEW.company_id;
            
            v_tx_cost := CASE 
                         WHEN COALESCE(item.quantity, 0) > 0 THEN ROUND((COALESCE(item.line_value, COALESCE(item.quantity, 0) * COALESCE(item.unit_price, 0)) * v_bill_discount_factor) / item.quantity, 4) 
                         ELSE ROUND(COALESCE(item.unit_price, 0) * v_bill_discount_factor, 4) 
                         END;

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

      IF TG_TABLE_NAME = 'docs_credit_notes' AND (v_is_posted AND (TG_OP = 'INSERT' OR v_status_old IS NULL OR v_status_old NOT IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'ACTIVE', 'CLOSED'))) THEN
        FOR item IN SELECT * FROM docs_credit_note_lines WHERE credit_note_id = NEW.id LOOP
          IF item.product_id IS NOT NULL AND item.product_id <> '' AND item.type = 'PRODUCT' THEN
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
    $$;
    `);
    console.log('SUCCESS!');
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await client.end();
  }
}
main();
