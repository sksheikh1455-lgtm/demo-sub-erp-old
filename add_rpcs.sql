CREATE OR REPLACE FUNCTION public.create_bill(p_bill jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bill_id uuid;
    v_bill_number text;
    v_company_id uuid;
    v_vendor_id uuid;
    v_date date;
    v_status text;
    v_total numeric;
    v_lines jsonb;
    v_line jsonb;
BEGIN
    v_bill_id := (p_bill->>'id')::uuid;
    v_company_id := (p_bill->>'companyId')::uuid;
    v_vendor_id := COALESCE(p_bill->>'vendorId', p_bill->>'supplierId')::uuid;
    v_date := (p_bill->>'date')::date;
    v_status := p_bill->>'status';
    IF v_status IS NULL THEN
        v_status := 'DRAFT';
    END IF;
    
    v_total := COALESCE((p_bill->>'total')::numeric, 0);
    v_lines := p_bill->'items';
    v_bill_number := p_bill->>'number';
    
    IF v_bill_number = 'DRAFT' OR v_bill_number = 'NEW' OR v_bill_number LIKE 'DRAFT-%' THEN
        v_bill_number := NULL;
    END IF;
    
    INSERT INTO public.docs_bills (
        id, company_id, vendor_id, date, status, total, data, bill_number
    ) VALUES (
        v_bill_id, v_company_id, v_vendor_id, v_date, v_status, v_total, p_bill, v_bill_number
    )
    ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        vendor_id = EXCLUDED.vendor_id,
        date = EXCLUDED.date,
        total = EXCLUDED.total,
        status = EXCLUDED.status,
        bill_number = EXCLUDED.bill_number
    RETURNING bill_number INTO v_bill_number;
    
    p_bill := jsonb_set(p_bill, '{number}', to_jsonb(v_bill_number));
    UPDATE public.docs_bills SET data = p_bill WHERE id = v_bill_id;
    
    DELETE FROM public.docs_bill_lines WHERE bill_id = v_bill_id;
    
    IF v_lines IS NOT NULL AND jsonb_array_length(v_lines) > 0 THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
        LOOP
            INSERT INTO public.docs_bill_lines (
                id, bill_id, company_id, product_id, quantity, unit_price, discount, tax, total, description, line_value, discount_rate, discount_mode, discount_value, type, display_index, data
            ) VALUES (
                COALESCE((v_line->>'id')::uuid, gen_random_uuid()),
                v_bill_id,
                v_company_id,
                (v_line->>'productId')::uuid,
                COALESCE((v_line->>'quantity')::numeric, 0),
                COALESCE((v_line->>'unitPrice')::numeric, COALESCE((v_line->>'rate')::numeric, 0)),
                COALESCE((v_line->>'discount')::numeric, COALESCE((v_line->>'discount_value')::numeric, 0)),
                COALESCE((v_line->>'tax')::numeric, COALESCE((v_line->>'taxValue')::numeric, 0)),
                COALESCE((v_line->>'lineValue')::numeric, COALESCE((v_line->>'total')::numeric, COALESCE((v_line->>'amount')::numeric, 0))),
                v_line->>'description',
                COALESCE((v_line->>'lineValue')::numeric, COALESCE((v_line->>'total')::numeric, COALESCE((v_line->>'amount')::numeric, 0))),
                COALESCE((v_line->>'discountRate')::numeric, 0),
                v_line->>'discountMode',
                COALESCE((v_line->>'discount')::numeric, COALESCE((v_line->>'discount_value')::numeric, 0)),
                COALESCE(v_line->>'type', 'PRODUCT'),
                COALESCE((v_line->>'display_index')::integer, 0),
                v_line
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id, 'bill_number', v_bill_number, 'data', p_bill);
END;
$$;
CREATE OR REPLACE FUNCTION public.create_credit_note(p_cn jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cn_id uuid;
    v_cn_number text;
    v_company_id uuid;
    v_customer_id uuid;
    v_date date;
    v_status text;
    v_total numeric;
    v_lines jsonb;
    v_line jsonb;
BEGIN
    v_cn_id := (p_cn->>'id')::uuid;
    v_company_id := (p_cn->>'companyId')::uuid;
    v_customer_id := (p_cn->>'customerId')::uuid;
    v_date := COALESCE((p_cn->>'date')::date, CURRENT_DATE);
    v_status := COALESCE(p_cn->>'status', 'DRAFT');
    v_total := COALESCE((p_cn->>'total')::numeric, 0);
    v_lines := p_cn->'items';
    v_cn_number := p_cn->>'number';
    
    IF v_cn_number = 'DRAFT' OR v_cn_number = 'NEW' OR v_cn_number LIKE 'DRAFT-%' THEN
        v_cn_number := NULL;
    END IF;
    
    INSERT INTO public.docs_credit_notes (
        id, company_id, customer_id, date, credit_note_date, status, total, subtotal, tax_total, origin_invoice_id, data, credit_note_number
    ) VALUES (
        v_cn_id, v_company_id, v_customer_id, v_date, v_date, v_status, v_total, COALESCE((p_cn->>'subtotal')::numeric, 0), COALESCE((p_cn->>'taxTotal')::numeric, 0), (p_cn->>'originInvoiceId')::uuid, p_cn, v_cn_number
    )
    ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        customer_id = EXCLUDED.customer_id,
        date = EXCLUDED.date,
        credit_note_date = EXCLUDED.credit_note_date,
        total = EXCLUDED.total,
        status = EXCLUDED.status,
        credit_note_number = EXCLUDED.credit_note_number
    RETURNING credit_note_number INTO v_cn_number;
    
    p_cn := jsonb_set(p_cn, '{number}', to_jsonb(v_cn_number));
    UPDATE public.docs_credit_notes SET data = p_cn WHERE id = v_cn_id;
    
    DELETE FROM public.docs_credit_note_lines WHERE credit_note_id = v_cn_id;
    
    IF v_lines IS NOT NULL AND jsonb_array_length(v_lines) > 0 THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
        LOOP
            INSERT INTO public.docs_credit_note_lines (
                id, credit_note_id, company_id, product_id, quantity, unit_price, discount, tax, total, description, line_value, discount_rate, discount_mode, discount_value, type, display_index, data
            ) VALUES (
                COALESCE((v_line->>'id')::uuid, gen_random_uuid()),
                v_cn_id,
                v_company_id,
                (v_line->>'productId')::uuid,
                COALESCE((v_line->>'quantity')::numeric, 0),
                COALESCE((v_line->>'unitPrice')::numeric, COALESCE((v_line->>'rate')::numeric, 0)),
                COALESCE((v_line->>'discount')::numeric, COALESCE((v_line->>'discount_value')::numeric, 0)),
                COALESCE((v_line->>'tax')::numeric, COALESCE((v_line->>'taxValue')::numeric, 0)),
                COALESCE((v_line->>'lineValue')::numeric, COALESCE((v_line->>'total')::numeric, COALESCE((v_line->>'amount')::numeric, 0))),
                v_line->>'description',
                COALESCE((v_line->>'lineValue')::numeric, COALESCE((v_line->>'total')::numeric, COALESCE((v_line->>'amount')::numeric, 0))),
                COALESCE((v_line->>'discountRate')::numeric, 0),
                v_line->>'discountMode',
                COALESCE((v_line->>'discount')::numeric, COALESCE((v_line->>'discount_value')::numeric, 0)),
                COALESCE(v_line->>'type', 'PRODUCT'),
                COALESCE((v_line->>'display_index')::integer, 0),
                v_line
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'credit_note_id', v_cn_id, 'credit_note_number', v_cn_number, 'data', p_cn);
END;
$$;
