import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();

  await client.query(`
    CREATE OR REPLACE FUNCTION process_invoice(p_invoice JSONB)
    RETURNS JSONB AS $$
    DECLARE
        v_company_id TEXT;
        v_invoice_id TEXT;
        v_status TEXT;
        v_date DATE;
        v_customer_id TEXT;
        v_total NUMERIC;
        v_number TEXT;
        v_item JSONB;
        v_lines JSONB;
    BEGIN
        v_invoice_id := p_invoice->>'id';
        v_company_id := p_invoice->>'companyId';
        v_status := p_invoice->>'status';
        v_date := (p_invoice->>'date')::DATE;
        v_customer_id := p_invoice->>'customerId';
        v_total := (p_invoice->>'total')::NUMERIC;
        v_number := p_invoice->>'number';
        v_lines := p_invoice->'items';

        -- Ensure Cash Sale logic
        IF v_customer_id ILIKE '%cash-sale%' THEN
            IF p_invoice->>'paymentMethod' IS NULL OR p_invoice->>'paymentMethod' = 'CASH' THEN
                p_invoice := jsonb_set(p_invoice, '{type}', '"CASH_SALE"');
            ELSE
                p_invoice := jsonb_set(p_invoice, '{type}', '"STANDARD"');
            END IF;
        END IF;

        -- 1. Insert Invoice Header as DRAFT to prevent premature triggers
        INSERT INTO docs_invoices (id, data, company_id, date, customer_id, status, total, invoice_number, updated_at)
        VALUES (v_invoice_id, jsonb_set(p_invoice, '{status}', '"DRAFT"'), v_company_id, v_date, v_customer_id, 'DRAFT', v_total, v_number, NOW())
        ON CONFLICT (id) DO UPDATE SET 
            data = EXCLUDED.data,
            company_id = EXCLUDED.company_id,
            date = EXCLUDED.date,
            customer_id = EXCLUDED.customer_id,
            total = EXCLUDED.total,
            invoice_number = EXCLUDED.invoice_number,
            updated_at = NOW();

        -- 2. Clear old lines
        DELETE FROM docs_invoice_lines WHERE invoice_id = v_invoice_id;

        -- 3. Insert new lines
        IF v_lines IS NOT NULL THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
                INSERT INTO docs_invoice_lines (id, invoice_id, company_id, product_id, quantity, unit_price, discount, tax, total, description, line_value, discount_rate, discount_mode, type, updated_at)
                VALUES (
                    COALESCE(v_item->>'id', gen_random_uuid()::TEXT),
                    v_invoice_id,
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
                    COALESCE(v_item->>'type', 'PRODUCT'),
                    NOW()
                );
            END LOOP;
        END IF;

        -- 4. Transition to final status
        IF v_status IN ('POSTED', 'PAID', 'PARTIAL') THEN
            UPDATE docs_invoices SET status = v_status, data = jsonb_set(data, '{status}', to_jsonb(v_status)) WHERE id = v_invoice_id;
            
            -- And run post_invoice RPC to generate journals
            PERFORM post_invoice(v_invoice_id, v_company_id);
        END IF;

        RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log("Deployed process_invoice successfully");
  await client.end();
}
run();
