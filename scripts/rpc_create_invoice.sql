CREATE OR REPLACE FUNCTION create_and_post_invoice(p_invoice JSONB)
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
    v_idx INT := 0;
BEGIN
    v_invoice_id := p_invoice->>'id';
    v_company_id := p_invoice->>'companyId';
    v_status := p_invoice->>'status';
    v_date := (p_invoice->>'date')::DATE;
    v_customer_id := p_invoice->>'customerId';
    v_total := (p_invoice->>'total')::NUMERIC;
    v_number := p_invoice->>'number';
    v_lines := p_invoice->'items';

    -- 1. Insert/Update Invoice Header
    INSERT INTO docs_invoices (id, data, company_id, date, customer_id, status, total, invoice_number, updated_at)
    VALUES (v_invoice_id, p_invoice, v_company_id, v_date, v_customer_id, v_status, v_total, v_number, NOW())
    ON CONFLICT (id) DO UPDATE SET 
        data = EXCLUDED.data,
        company_id = EXCLUDED.company_id,
        date = EXCLUDED.date,
        customer_id = EXCLUDED.customer_id,
        status = EXCLUDED.status,
        total = EXCLUDED.total,
        invoice_number = EXCLUDED.invoice_number,
        updated_at = NOW();

    -- 2. Clear old lines
    DELETE FROM docs_invoice_lines WHERE invoice_id = v_invoice_id;

    -- 3. Insert new lines
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

    -- 4. If status is POSTED or PAID, the generate_inventory_movements trigger 
    -- will fire automatically when docs_invoices was updated/inserted.
    -- WAIT: The trigger fires ON docs_invoices. But we just inserted docs_invoices BEFORE docs_invoice_lines.
    -- So the trigger might have fired with NO lines!
    -- This is why the frontend did DRAFT first, then lines, then POSTED.

    -- So let's do:
    IF v_status IN ('POSTED', 'PAID', 'PARTIAL') THEN
        UPDATE docs_invoices SET status = v_status WHERE id = v_invoice_id;
        
        -- And run post_invoice RPC to generate journals
        PERFORM post_invoice(v_invoice_id, v_company_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
