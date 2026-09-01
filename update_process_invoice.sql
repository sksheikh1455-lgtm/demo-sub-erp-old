CREATE OR REPLACE FUNCTION public.process_invoice(p_invoice jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
AS $function$
    DECLARE
        v_company_id TEXT;
        v_invoice_id TEXT;
        v_status TEXT;
        v_date DATE;
        v_customer_id TEXT;
        v_number TEXT;
        v_item JSONB;
        v_lines JSONB;
        v_new_lines JSONB := '[]'::jsonb;
        v_existing_number TEXT;
        
        -- Product lookup
        v_prod_rec RECORD;
        
        -- Calculated totals
        v_calc_qty NUMERIC;
        v_calc_price NUMERIC;
        v_calc_gross NUMERIC;
        v_calc_disc_rate NUMERIC;
        v_calc_disc_mode TEXT;
        v_calc_disc_amt NUMERIC;
        v_calc_tax_amt NUMERIC;
        v_calc_line_total NUMERIC;
        
        v_inv_subtotal NUMERIC := 0;
        v_inv_discount NUMERIC := 0;
        v_inv_tax NUMERIC := 0;
        v_inv_total NUMERIC := 0;
    BEGIN
        v_invoice_id := p_invoice->>'id';
        v_company_id := p_invoice->>'companyId';
        v_status := p_invoice->>'status';
        v_date := (p_invoice->>'date')::DATE;
        v_customer_id := p_invoice->>'customerId';
        v_number := p_invoice->>'number';
        v_lines := p_invoice->'items';

        IF v_customer_id ILIKE '%cash-sale%' THEN
            IF p_invoice->>'paymentMethod' IS NULL OR p_invoice->>'paymentMethod' = 'CASH' THEN
                p_invoice := jsonb_set(p_invoice, '{type}', '"CASH_SALE"');
            ELSE
                p_invoice := jsonb_set(p_invoice, '{type}', '"STANDARD"');
            END IF;
        END IF;
        
        SELECT invoice_number INTO v_existing_number FROM docs_invoices WHERE id = v_invoice_id;
        IF v_existing_number IS NOT NULL AND v_existing_number NOT LIKE 'DRAFT-%' AND v_existing_number != 'NEW' THEN
            v_number := v_existing_number;
            p_invoice := jsonb_set(p_invoice, '{number}', to_jsonb(v_existing_number));
        END IF;

        -- Calculate lines
        IF v_lines IS NOT NULL THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
                v_calc_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
                
                -- Backend Driven Line Calculations
                IF COALESCE(v_item->>'type', 'PRODUCT') = 'PRODUCT' AND v_item->>'productId' IS NOT NULL THEN
                    SELECT price, name, data->>'description' as description INTO v_prod_rec FROM docs_products WHERE id = v_item->>'productId';
                    IF FOUND THEN
                        v_calc_price := COALESCE((v_item->>'unitPrice')::NUMERIC, v_prod_rec.price, 0);
                        -- Update item with backend price and description if empty
                        v_item := jsonb_set(v_item, '{unitPrice}', to_jsonb(v_calc_price));
                        IF v_item->>'description' IS NULL OR v_item->>'description' = '' THEN
                            v_item := jsonb_set(v_item, '{description}', to_jsonb(COALESCE(v_prod_rec.description, v_prod_rec.name, '')));
                        END IF;
                    ELSE
                        v_calc_price := COALESCE((v_item->>'unitPrice')::NUMERIC, 0);
                    END IF;
                ELSE
                    v_calc_price := COALESCE((v_item->>'unitPrice')::NUMERIC, 0);
                END IF;
                
                v_calc_gross := v_calc_qty * v_calc_price;
                v_calc_disc_rate := COALESCE((v_item->>'discountRate')::NUMERIC, 0);
                v_calc_disc_mode := COALESCE(v_item->>'discountMode', 'PERCENT');
                
                IF v_calc_disc_mode = 'FIXED' THEN
                    v_calc_disc_amt := v_calc_disc_rate;
                ELSE
                    v_calc_disc_amt := ROUND((v_calc_gross * (v_calc_disc_rate / 100.0)), 2);
                END IF;
                
                v_calc_tax_amt := COALESCE((v_item->>'taxValue')::NUMERIC, 0);
                v_calc_line_total := ROUND((v_calc_gross - v_calc_disc_amt + v_calc_tax_amt), 2);
                
                v_inv_subtotal := v_inv_subtotal + v_calc_gross;
                v_inv_discount := v_inv_discount + v_calc_disc_amt;
                v_inv_tax := v_inv_tax + v_calc_tax_amt;
                v_inv_total := v_inv_total + v_calc_line_total;

                v_item := jsonb_set(v_item, '{discountAmount}', to_jsonb(v_calc_disc_amt));
                v_item := jsonb_set(v_item, '{taxAmount}', to_jsonb(v_calc_tax_amt));
                v_item := jsonb_set(v_item, '{total}', to_jsonb(v_calc_line_total));
                v_item := jsonb_set(v_item, '{lineValue}', to_jsonb(v_calc_line_total));
                
                v_new_lines := v_new_lines || v_item;
            END LOOP;
        END IF;

        p_invoice := jsonb_set(p_invoice, '{items}', v_new_lines);
        p_invoice := jsonb_set(p_invoice, '{subtotal}', to_jsonb(v_inv_subtotal));
        p_invoice := jsonb_set(p_invoice, '{discountTotal}', to_jsonb(v_inv_discount));
        p_invoice := jsonb_set(p_invoice, '{taxTotal}', to_jsonb(v_inv_tax));
        p_invoice := jsonb_set(p_invoice, '{total}', to_jsonb(v_inv_total));
        p_invoice := jsonb_set(p_invoice, '{status}', '"DRAFT"');

        DELETE FROM docs_invoice_lines WHERE invoice_id = v_invoice_id;

        IF v_new_lines IS NOT NULL THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_new_lines) LOOP
                INSERT INTO docs_invoice_lines (
                    id, invoice_id, company_id, product_id, quantity, unit_price, 
                    discount, tax, total, description, line_value, 
                    discount_rate, discount_mode, type, updated_at
                )
                VALUES (
                    COALESCE(v_item->>'id', gen_random_uuid()::TEXT),
                    v_invoice_id,
                    v_company_id,
                    v_item->>'productId',
                    (v_item->>'quantity')::NUMERIC,
                    (v_item->>'unitPrice')::NUMERIC,
                    (v_item->>'discountAmount')::NUMERIC,
                    (v_item->>'taxAmount')::NUMERIC,
                    (v_item->>'total')::NUMERIC,
                    v_item->>'description',
                    (v_item->>'lineValue')::NUMERIC,
                    (v_item->>'discountRate')::NUMERIC,
                    v_item->>'discountMode',
                    COALESCE(v_item->>'type', 'PRODUCT'),
                    NOW()
                );
            END LOOP;
        END IF;

        INSERT INTO docs_invoices (
            id, data, company_id, date, customer_id, status, 
            subtotal, discount_total, tax_total, total, invoice_number, updated_at
        )
        VALUES (
            v_invoice_id, p_invoice, v_company_id, v_date, v_customer_id, 'DRAFT', 
            v_inv_subtotal, v_inv_discount, v_inv_tax, v_inv_total, v_number, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET 
            data = EXCLUDED.data,
            company_id = EXCLUDED.company_id,
            date = EXCLUDED.date,
            customer_id = EXCLUDED.customer_id,
            subtotal = EXCLUDED.subtotal,
            discount_total = EXCLUDED.discount_total,
            tax_total = EXCLUDED.tax_total,
            total = EXCLUDED.total,
            invoice_number = CASE 
                WHEN docs_invoices.invoice_number IS NOT NULL AND docs_invoices.invoice_number NOT LIKE 'DRAFT-%' THEN docs_invoices.invoice_number 
                ELSE EXCLUDED.invoice_number 
            END,
            updated_at = NOW();

        IF v_status IN ('POSTED', 'PAID', 'PARTIAL') THEN
            PERFORM post_invoice(v_invoice_id, v_company_id);
        END IF;

        RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'processed_invoice', p_invoice);
    END;
$function$;
