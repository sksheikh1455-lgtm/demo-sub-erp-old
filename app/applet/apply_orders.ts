import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const c = new Client({ connectionString });
  await c.connect();
  await c.query(fs.readFileSync('sync_invoice_lines.sql', 'utf8'));
  
  // also create sync_bill_lines_from_doc_data
  await c.query(`
    CREATE OR REPLACE FUNCTION public.sync_bill_lines_from_doc_data()
     RETURNS trigger
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    DECLARE
        v_item JSONB;
        v_items_array JSONB;
        v_serial_json JSONB;
        v_line_id TEXT;
        v_raw_id TEXT;
        v_idx INTEGER;
    BEGIN
        IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
        IF NEW.data IS NULL OR NOT (NEW.data ? 'items') THEN RETURN NEW; END IF;
        
        v_items_array := NEW.data->'items';
        IF jsonb_typeof(v_items_array) <> 'array' THEN RETURN NEW; END IF;

        IF TG_OP = 'UPDATE' AND OLD.data IS NOT NULL AND OLD.data->'items' IS NOT DISTINCT FROM NEW.data->'items' THEN
            RETURN NEW;
        END IF;

        DELETE FROM docs_bill_lines
        WHERE bill_id = NEW.id
          AND id NOT IN (
              SELECT md5(NEW.id || '-' || COALESCE(elem->>'id', '')) 
              FROM jsonb_array_elements(v_items_array) AS elem
              WHERE elem->>'id' IS NOT NULL
          );

        FOR v_item, v_idx IN SELECT value, ordinality FROM jsonb_array_elements(v_items_array) WITH ORDINALITY LOOP
            v_serial_json := v_item->'serialNumbers';
            IF v_serial_json IS NULL OR jsonb_typeof(v_serial_json) <> 'array' THEN v_serial_json := '[]'::jsonb; END IF;

            v_raw_id := v_item->>'id';
            IF v_raw_id IS NULL OR v_raw_id = '' THEN v_raw_id := gen_random_uuid()::TEXT; END IF;
            
            v_line_id := md5(NEW.id || '-' || v_raw_id);

            INSERT INTO docs_bill_lines (
                id, bill_id, company_id, product_id, quantity, unit_price, discount, tax, total, description, line_value, discount_rate, discount_mode, type, serial_numbers, display_index
            ) VALUES (
                v_line_id, NEW.id, NEW.company_id, v_item->>'productId',
                COALESCE((v_item->>'quantity')::NUMERIC, 0),
                COALESCE((v_item->>'unitPrice')::NUMERIC, 0),
                COALESCE((v_item->>'discountAmount')::NUMERIC, COALESCE((v_item->>'discount')::NUMERIC, 0)),
                COALESCE((v_item->>'taxValue')::NUMERIC, COALESCE((v_item->>'taxAmount')::NUMERIC, 0)),
                COALESCE((v_item->>'total')::NUMERIC, 0),
                COALESCE(v_item->>'description', ''),
                COALESCE((v_item->>'lineValue')::NUMERIC, COALESCE((v_item->>'total')::NUMERIC, 0)),
                COALESCE((v_item->>'discountRate')::NUMERIC, 0),
                COALESCE(v_item->>'discountMode', 'PERCENT'),
                COALESCE(v_item->>'type', 'PRODUCT'), v_serial_json, v_idx
            ) ON CONFLICT (id) DO UPDATE SET
                product_id = EXCLUDED.product_id, quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price, discount = EXCLUDED.discount, tax = EXCLUDED.tax, total = EXCLUDED.total, description = EXCLUDED.description, line_value = EXCLUDED.line_value, discount_rate = EXCLUDED.discount_rate, discount_mode = EXCLUDED.discount_mode, type = EXCLUDED.type, serial_numbers = EXCLUDED.serial_numbers, display_index = EXCLUDED.display_index;
        END LOOP;

        RETURN NEW;
    END;
    $function$;
  `);
  
  await c.query(`
     DROP TRIGGER IF EXISTS trg_sync_docs_bills_lines ON docs_bills;
     CREATE TRIGGER trg_sync_docs_bills_lines AFTER INSERT OR UPDATE ON docs_bills FOR EACH ROW EXECUTE PROCEDURE sync_bill_lines_from_doc_data();
  `);
  
  console.log('Successfully completed scripts!');
  await c.end();
}
main();
