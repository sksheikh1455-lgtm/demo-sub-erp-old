import { Client } from 'pg';

async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:sk445@raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres' });
  await client.connect();
  
  await client.query(`
    CREATE OR REPLACE FUNCTION process_bill(p_bill JSONB)
    RETURNS JSONB AS $$
    DECLARE
        v_company_id TEXT;
        v_bill_id TEXT;
        v_status TEXT;
        v_date DATE;
        v_vendor_id TEXT;
        v_total NUMERIC;
        v_number TEXT;
        v_item JSONB;
        v_lines JSONB;
    BEGIN
        v_bill_id := p_bill->>'id';
        v_company_id := COALESCE(p_bill->>'companyId', p_bill->>'company_id');
        v_status := p_bill->>'status';
        v_date := (p_bill->>'date')::DATE;
        v_vendor_id := COALESCE(p_bill->>'vendorId', p_bill->>'supplierId');
        v_total := (p_bill->>'total')::NUMERIC;
        v_number := p_bill->>'number';
        v_lines := p_bill->'items';

        -- 1. Insert Bill Header as DRAFT to prevent premature triggers
        INSERT INTO docs_bills (id, data, company_id, date, vendor_id, status, total, bill_number, updated_at)
        VALUES (v_bill_id, jsonb_set(p_bill, '{status}', '"DRAFT"'), v_company_id, v_date, v_vendor_id, 'DRAFT', v_total, v_number, NOW())
        ON CONFLICT (id) DO UPDATE SET 
            data = EXCLUDED.data,
            company_id = EXCLUDED.company_id,
            date = EXCLUDED.date,
            vendor_id = EXCLUDED.vendor_id,
            total = EXCLUDED.total,
            bill_number = EXCLUDED.bill_number,
            updated_at = NOW();

        -- 2. Clear old lines
        DELETE FROM docs_bill_lines WHERE bill_id = v_bill_id;

        -- 3. Insert new lines
        IF v_lines IS NOT NULL THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
                INSERT INTO docs_bill_lines (id, bill_id, company_id, product_id, quantity, unit_price, discount, tax, total, description, line_value, discount_rate, discount_mode, discount_value, type, updated_at)
                VALUES (
                    COALESCE(v_item->>'id', gen_random_uuid()::TEXT),
                    v_bill_id,
                    v_company_id,
                    v_item->>'productId',
                    (v_item->>'quantity')::NUMERIC,
                    (v_item->>'unitPrice')::NUMERIC,
                    COALESCE((v_item->>'discountAmount')::NUMERIC, 0),
                    COALESCE((v_item->>'taxAmount')::NUMERIC, 0),
                    (v_item->>'total')::NUMERIC,
                    v_item->>'description',
                    COALESCE((v_item->>'lineValue')::NUMERIC, (v_item->>'total')::NUMERIC),
                    (v_item->>'discountRate')::NUMERIC,
                    v_item->>'discountMode',
                    (v_item->>'discountAmount')::NUMERIC,
                    COALESCE(v_item->>'type', 'PRODUCT'),
                    NOW()
                );
            END LOOP;
        END IF;

        -- 4. Transition to final status
        IF v_status IN ('POSTED', 'PAID', 'PARTIAL') THEN
            UPDATE docs_bills SET status = v_status, data = jsonb_set(data, '{status}', to_jsonb(v_status)) WHERE id = v_bill_id;
            
            -- And run post_bill RPC to generate journals
            PERFORM post_bill(v_bill_id, v_company_id);
        END IF;

        RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);
  
  console.log("Deployed process_bill successfully");
  await client.end();
}
run();
