
      
      
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
  v_items JSONB;
BEGIN
  IF current_setting('core.bypass_audit', true) = 'true' THEN RETURN NEW; END IF;
  IF pg_trigger_depth() > 3 THEN RETURN NEW; END IF;
  
  IF TG_OP = 'UPDATE' THEN
      IF NEW.status IS NOT DISTINCT FROM OLD.status
          AND (NULLIF(to_jsonb(NEW)->>'date', '')::DATE) IS NOT DISTINCT FROM (NULLIF(to_jsonb(OLD)->>'date', '')::DATE)
          AND NEW.data IS NOT DISTINCT FROM OLD.data
          AND (NULLIF(to_jsonb(NEW)->>'subtotal', '')::NUMERIC) IS NOT DISTINCT FROM (NULLIF(to_jsonb(OLD)->>'subtotal', '')::NUMERIC) THEN
         RETURN NEW;
     END IF;
  END IF;

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

  v_is_posted := v_status_new IN ('POSTED', 'PAID', 'PARTIAL', 'IN_PAYMENT', 'OPEN', 'CLOSED', 'FULL_REFUNDED', 'PARTIAL_REFUNDED');

  IF TG_OP = 'UPDATE' THEN
     DELETE FROM docs_inventory_transactions WHERE reference_id = NEW.id;
  END IF;

  IF TG_TABLE_NAME = 'docs_inventory_adjustments' AND v_is_posted THEN
      v_data := (row_to_json(NEW)::jsonb)->'data';
      IF v_data IS NOT NULL AND (v_data->'items') IS NOT NULL THEN
        FOR adj_item IN SELECT * FROM jsonb_array_elements(v_data->'items') LOOP
          v_wh_id := COALESCE(NULLIF(adj_item->>'warehouseId', ''), NULLIF(v_data->>'warehouseId', ''), 'wh-' || NEW.company_id);
          INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price)
          VALUES (
            'mov-adj-' || NEW.id || '-' || COALESCE(NULLIF(adj_item->>'productId', ''), md5(adj_item::text)), 
            NEW.company_id, 
            NULLIF(adj_item->>'productId', ''), 
            v_wh_id, 
            CASE WHEN NULLIF(adj_item->>'difference', '')::NUMERIC >= 0 THEN 'IN' ELSE 'OUT' END, 
            ABS(NULLIF(adj_item->>'difference', '')::NUMERIC), 
            NEW.id, 
            'ADJUSTMENT', 
            COALESCE(NULLIF(v_data->>'date', '')::DATE, NEW.updated_at::DATE, NOW()::DATE), 
            COALESCE(NULLIF(adj_item->>'costPrice', '')::NUMERIC, (SELECT cost_price FROM docs_products WHERE id = NULLIF(adj_item->>'productId', '')), 0)
          )
          ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
        END LOOP;
      END IF;
  END IF;

  IF TG_TABLE_NAME = 'docs_invoices' AND v_is_posted THEN
    v_data := (row_to_json(NEW)::jsonb)->'data';
    v_items := COALESCE(v_data->'items', '[]'::jsonb);
    
    FOR adj_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      IF NULLIF(adj_item->>'productId', '') IS NOT NULL AND (adj_item->>'type' = 'PRODUCT' OR adj_item->>'type' IS NULL) THEN
        v_wh_id := 'wh-' || NEW.company_id;
        
        SELECT avg_cost INTO v_tx_cost FROM docs_product_costs 
        WHERE product_id = adj_item->>'productId' AND warehouse_id = v_wh_id AND company_id = NEW.company_id;
        
        IF v_tx_cost IS NULL THEN
            SELECT cost_price INTO v_tx_cost FROM docs_products WHERE id = adj_item->>'productId';
        END IF;
        IF v_tx_cost IS NULL THEN v_tx_cost := 0; END IF;

        INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, unit_price)
        VALUES (
          'mov-inv-' || NEW.id || '-' || COALESCE(NULLIF(adj_item->>'id', ''), md5(adj_item::text)),
          NEW.company_id,
          adj_item->>'productId',
          v_wh_id,
          'OUT',
          COALESCE(NULLIF(adj_item->>'quantity', '')::NUMERIC, 0),
          NEW.id,
          'INVOICE',
          COALESCE((NULLIF(to_jsonb(NEW)->>'date', '')::DATE), NOW()::DATE),
          v_tx_cost,
          COALESCE(NULLIF(adj_item->>'unitPrice', '')::NUMERIC, 0)
        ) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  IF TG_TABLE_NAME = 'docs_bills' AND v_is_posted THEN
    IF COALESCE((NULLIF(to_jsonb(NEW)->>'subtotal', '')::NUMERIC), 0) > 0 THEN 
       v_bill_discount_factor := ROUND(((NULLIF(to_jsonb(NEW)->>'subtotal', '')::NUMERIC) - COALESCE((NULLIF(to_jsonb(NEW)->>'discount_total', '')::NUMERIC), 0)) / (NULLIF(to_jsonb(NEW)->>'subtotal', '')::NUMERIC), 4);
    ELSE 
       v_bill_discount_factor := 1.0;
    END IF;

    v_data := (row_to_json(NEW)::jsonb)->'data';
    v_items := COALESCE(v_data->'items', '[]'::jsonb);

    FOR adj_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      IF NULLIF(adj_item->>'productId', '') IS NOT NULL AND (adj_item->>'type' = 'PRODUCT' OR adj_item->>'type' IS NULL) THEN
        v_wh_id := 'wh-' || NEW.company_id;
        
        v_tx_cost := CASE 
                       WHEN COALESCE(NULLIF(adj_item->>'quantity', '')::NUMERIC, 0) > 0 THEN ROUND((COALESCE(NULLIF(adj_item->>'lineValue', '')::NUMERIC, COALESCE(NULLIF(adj_item->>'quantity', '')::NUMERIC, 0) * COALESCE(NULLIF(adj_item->>'unitPrice', '')::NUMERIC, 0)) * v_bill_discount_factor) / NULLIF(adj_item->>'quantity', '')::NUMERIC, 4)
                     ELSE ROUND(COALESCE(NULLIF(adj_item->>'unitPrice', '')::NUMERIC, 0) * v_bill_discount_factor, 4)
                     END;

        INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, unit_price)
        VALUES (
          'mov-bil-' || NEW.id || '-' || COALESCE(NULLIF(adj_item->>'id', ''), md5(adj_item::text)),
          NEW.company_id,
          adj_item->>'productId',
          v_wh_id,
          'IN',
          COALESCE(NULLIF(adj_item->>'quantity', '')::NUMERIC, 0),
          NEW.id,
          'BILL',
          COALESCE((NULLIF(to_jsonb(NEW)->>'date', '')::DATE), NOW()::DATE),
          v_tx_cost,
          COALESCE(NULLIF(adj_item->>'unitPrice', '')::NUMERIC, 0)
        ) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  IF TG_TABLE_NAME = 'docs_credit_notes' AND v_is_posted THEN
    v_data := (row_to_json(NEW)::jsonb)->'data';
    v_items := COALESCE(v_data->'items', '[]'::jsonb);

    FOR adj_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      IF NULLIF(adj_item->>'productId', '') IS NOT NULL AND (adj_item->>'type' = 'PRODUCT' OR adj_item->>'type' IS NULL) THEN
        v_wh_id := 'wh-' || NEW.company_id;
        
        SELECT avg_cost INTO v_tx_cost FROM docs_product_costs 
        WHERE product_id = adj_item->>'productId' AND warehouse_id = v_wh_id AND company_id = NEW.company_id;
        
        IF v_tx_cost IS NULL THEN
            SELECT cost_price INTO v_tx_cost FROM docs_products WHERE id = adj_item->>'productId';
        END IF;
        IF v_tx_cost IS NULL THEN v_tx_cost := 0; END IF;

        INSERT INTO docs_inventory_transactions (id, company_id, product_id, warehouse_id, transaction_type, quantity, reference_id, reference_type, date, cost_price, unit_price)
        VALUES (
          'mov-cn-' || NEW.id || '-' || COALESCE(NULLIF(adj_item->>'id', ''), md5(adj_item::text)),
          NEW.company_id,
          adj_item->>'productId',
          v_wh_id,
          'IN',
          COALESCE(NULLIF(adj_item->>'quantity', '')::NUMERIC, 0),
          NEW.id,
          'CREDIT_NOTE',
          COALESCE((NULLIF(to_jsonb(NEW)->>'date', '')::DATE), NOW()::DATE),
          v_tx_cost,
          COALESCE(NULLIF(adj_item->>'unitPrice', '')::NUMERIC, 0)
        ) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, cost_price = EXCLUDED.cost_price, updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;

      
      