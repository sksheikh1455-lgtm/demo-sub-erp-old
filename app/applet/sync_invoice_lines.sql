CREATE OR REPLACE FUNCTION public.sync_invoice_lines_from_doc_data()
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
    -- Recursion guard
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Only proceed if data contains items
    IF NEW.data IS NULL OR NOT (NEW.data ? 'items') THEN
        RETURN NEW;
    END IF;

    v_items_array := NEW.data->'items';
    IF jsonb_typeof(v_items_array) <> 'array' THEN
        RETURN NEW;
    END IF;

    -- Avoid redundant runs if OLD items matches NEW items
    IF TG_OP = 'UPDATE' AND OLD.data IS NOT NULL AND OLD.data->'items' IS NOT DISTINCT FROM NEW.data->'items' THEN
        RETURN NEW;
    END IF;

    -- Delete lines that are not in the new items list
    DELETE FROM docs_invoice_lines
    WHERE invoice_id = NEW.id
      AND id NOT IN (
          SELECT md5(NEW.id || '-' || COALESCE(elem->>'id', '')) 
          FROM jsonb_array_elements(v_items_array) AS elem
          WHERE elem->>'id' IS NOT NULL
      );

    -- Loop through elements and upsert them (preserve order implicitly via display_index)
    FOR v_item, v_idx IN SELECT value, ordinality FROM jsonb_array_elements(v_items_array) WITH ORDINALITY LOOP
        -- Prepare serial_numbers
        v_serial_json := v_item->'serialNumbers';
        IF v_serial_json IS NULL OR jsonb_typeof(v_serial_json) <> 'array' THEN
            v_serial_json := '[]'::jsonb;
        END IF;

        v_raw_id := v_item->>'id';
        IF v_raw_id IS NULL OR v_raw_id = '' THEN
            v_raw_id := gen_random_uuid()::TEXT;
        END IF;
        
        -- Use md5 hash to generate 100% deterministic and unique item line ID per invoice
        v_line_id := md5(NEW.id || '-' || v_raw_id);

        INSERT INTO docs_invoice_lines (
            id,
            invoice_id,
            company_id,
            product_id,
            quantity,
            unit_price,
            discount,
            tax,
            total,
            description,
            line_value,
            discount_rate,
            discount_mode,
            type,
            uom,
            display_description,
            serial_numbers,
            display_index
        ) VALUES (
            v_line_id,
            NEW.id,
            NEW.company_id,
            v_item->>'productId',
            COALESCE((v_item->>'quantity')::NUMERIC, 0),
            COALESCE((v_item->>'unitPrice')::NUMERIC, 0),
            COALESCE((v_item->>'discountAmount')::NUMERIC, COALESCE((v_item->>'discount')::NUMERIC, 0)),
            COALESCE((v_item->>'taxValue')::NUMERIC, COALESCE((v_item->>'taxAmount')::NUMERIC, 0)),
            COALESCE((v_item->>'total')::NUMERIC, 0),
            COALESCE(v_item->>'description', ''),
            COALESCE((v_item->>'lineValue')::NUMERIC, COALESCE((v_item->>'total')::NUMERIC, 0)),
            COALESCE((v_item->>'discountRate')::NUMERIC, 0),
            COALESCE(v_item->>'discountMode', 'PERCENT'),
            COALESCE(v_item->>'type', 'PRODUCT'),
            v_item->>'uom',
            v_item->>'displayDescription',
            v_serial_json,
            v_idx
        ) ON CONFLICT (id) DO UPDATE SET
            product_id = EXCLUDED.product_id,
            quantity = EXCLUDED.quantity,
            unit_price = EXCLUDED.unit_price,
            discount = EXCLUDED.discount,
            tax = EXCLUDED.tax,
            total = EXCLUDED.total,
            description = EXCLUDED.description,
            line_value = EXCLUDED.line_value,
            discount_rate = EXCLUDED.discount_rate,
            discount_mode = EXCLUDED.discount_mode,
            type = EXCLUDED.type,
            uom = EXCLUDED.uom,
            display_description = EXCLUDED.display_description,
            serial_numbers = EXCLUDED.serial_numbers,
            display_index = EXCLUDED.display_index;
    END LOOP;

    RETURN NEW;
END;
$function$;
