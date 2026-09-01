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
    v_vendor_id := (p_bill->>'vendorId')::uuid;
    v_date := (p_bill->>'date')::date;
    v_status := 'DRAFT';
    v_total := COALESCE((p_bill->>'total')::numeric, 0);
    v_lines := p_bill->'items';
    v_bill_number := p_bill->>'number';
    
    -- Insert bill
    INSERT INTO public.docs_bills (
        id, company_id, vendor_id, date, status, total, data, bill_number
    ) VALUES (
        v_bill_id, v_company_id, v_vendor_id, v_date, v_status, v_total, p_bill, v_bill_number
    ) RETURNING bill_number INTO v_bill_number;
    
    -- Update JSON with generated number if it was null
    p_bill := jsonb_set(p_bill, '{number}', to_jsonb(v_bill_number));
    UPDATE public.docs_bills SET data = p_bill WHERE id = v_bill_id;
    
    -- Insert lines
    IF v_lines IS NOT NULL AND jsonb_array_length(v_lines) > 0 THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
        LOOP
            INSERT INTO public.docs_bill_lines (
                id, bill_id, company_id, item_id, account_id, description, quantity, rate, amount, data
            ) VALUES (
                (v_line->>'id')::uuid,
                v_bill_id,
                v_company_id,
                (v_line->>'productId')::uuid,
                (v_line->>'accountId')::uuid,
                v_line->>'description',
                COALESCE((v_line->>'quantity')::numeric, 0),
                COALESCE((v_line->>'rate')::numeric, 0),
                COALESCE((v_line->>'amount')::numeric, 0),
                v_line
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'bill_id', v_bill_id, 'bill_number', v_bill_number, 'data', p_bill);
END;
$$;
