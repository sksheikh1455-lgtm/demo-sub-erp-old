import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  console.log('--- STARTING HIGH-PERFORMANCE MASTER REPAIR SCRIPT (REPLICA ROLE) ---');

  // 1. Redeploy capture_cost_at_sale with robust company_id fallback resolution
  console.log('1. Re-deploying capture_cost_at_sale()...');
  await c.query(`
    CREATE OR REPLACE FUNCTION public.capture_cost_at_sale()
     RETURNS trigger
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    DECLARE
        v_company_id TEXT;
    BEGIN
        IF NEW.product_id IS NOT NULL THEN
            -- Safely resolve company_id from parent invoice if missing/empty in line
            v_company_id := NEW.company_id;
            IF v_company_id IS NULL OR v_company_id = '' THEN
                SELECT company_id INTO v_company_id FROM docs_invoices WHERE id = NEW.invoice_id;
                NEW.company_id := v_company_id;
            END IF;

            -- Only set if it hasn't been explicitly locked / provided
            IF NEW.cost_price_at_sale IS NULL OR NEW.cost_price_at_sale = 0 THEN
                -- Try company warehouse WAC
                SELECT avg_cost INTO NEW.cost_price_at_sale 
                FROM docs_product_costs 
                WHERE product_id = NEW.product_id 
                  AND company_id = v_company_id 
                  AND warehouse_id = 'wh-' || v_company_id
                LIMIT 1;

                -- Fallback to main warehouse WAC
                IF NEW.cost_price_at_sale IS NULL OR NEW.cost_price_at_sale = 0 THEN
                    SELECT avg_cost INTO NEW.cost_price_at_sale 
                    FROM docs_product_costs 
                    WHERE product_id = NEW.product_id 
                      AND company_id = v_company_id 
                      AND warehouse_id = 'main'
                    LIMIT 1;
                END IF;

                -- Fallback to product defined cost_price
                IF NEW.cost_price_at_sale IS NULL OR NEW.cost_price_at_sale = 0 THEN
                    SELECT COALESCE(cost_price, last_purchase_price, initial_cost, (data->>'costPrice')::numeric, 0)
                    INTO NEW.cost_price_at_sale
                    FROM docs_products
                    WHERE id = NEW.product_id;
                END IF;
                
                NEW.cost_price_at_sale := COALESCE(NEW.cost_price_at_sale, 0);
            END IF;
        END IF;
        RETURN NEW;
    END;
    $function$;
  `);
  console.log('Successfully updated capture_cost_at_sale().');

  // 2. Redeploy post_inventory_ledger_lines with explicit 500101 resolution
  console.log('2. Re-deploying post_inventory_ledger_lines()...');
  await c.query(`
    CREATE OR REPLACE FUNCTION public.post_inventory_ledger_lines()
     RETURNS trigger
     LANGUAGE plpgsql
     SECURITY DEFINER
    AS $function$
    DECLARE
        v_journal_id TEXT;
        v_inv_acc TEXT;
        v_cogs_acc TEXT;
        v_exp_acc TEXT;
        v_valuation NUMERIC;
        v_company_id TEXT;
        v_product_name TEXT;
        v_contact_id TEXT;
    BEGIN
        IF pg_trigger_depth() > 5 THEN RETURN NEW; END IF;

        IF NEW.quantity = 0 THEN RETURN NEW; END IF;

        v_company_id := NEW.company_id;
        v_valuation := ROUND(NEW.quantity * NEW.cost_price, 2);

        IF v_valuation = 0 THEN RETURN NEW; END IF;

        -- Target standard asset inventory account
        SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = v_company_id LIMIT 1;
        IF v_inv_acc IS NULL THEN SELECT id INTO v_inv_acc FROM docs_accounts WHERE (name ILIKE '%inventory%' OR code ILIKE '1005%') AND company_id = v_company_id LIMIT 1; END IF;
        
        -- Target 500101 and 500100 first for COGS, then 400501, then names resembling COGS
        SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100', '400501') AND company_id = v_company_id LIMIT 1;
        IF v_cogs_acc IS NULL THEN 
            SELECT id INTO v_cogs_acc 
            FROM docs_accounts 
            WHERE (name ILIKE '%cost of goods%' OR name ILIKE '%cogs%' OR code ILIKE '5001%' OR code ILIKE '4005%') 
              AND company_id = v_company_id 
            LIMIT 1; 
        END IF;

        SELECT id INTO v_exp_acc FROM docs_accounts WHERE code = '500501' AND company_id = v_company_id LIMIT 1;
        IF v_exp_acc IS NULL THEN SELECT id INTO v_exp_acc FROM docs_accounts WHERE (name ILIKE '%adjustment%' OR code ILIKE '5005%') AND company_id = v_company_id LIMIT 1; END IF;

        SELECT data->>'name' INTO v_product_name FROM docs_products WHERE id = NEW.product_id;

        IF NEW.reference_type = 'INVOICE' THEN
            v_journal_id := 'JE-' || replace(replace(UPPER(NEW.reference_id), 'INV-', ''), 'INVOICE-', '');
            IF TG_OP = 'INSERT' AND NEW.transaction_type = 'OUT' THEN
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-cogs-' || NEW.id, v_journal_id, v_company_id, v_cogs_acc, v_valuation, 0, 'COGS: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-inv-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, 0, v_valuation, 'Inv Red: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
            END IF;
        ELSIF NEW.reference_type = 'CREDIT_NOTE' THEN
            v_journal_id := 'JE-' || replace(replace(UPPER(NEW.reference_id), 'CN-', ''), 'CREDIT-', '');
            IF TG_OP = 'INSERT' AND NEW.transaction_type = 'IN' THEN
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-inv-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, v_valuation, 0, 'Inv Add: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
                 INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                 VALUES ('JL-' || v_journal_id || '-cogs-' || NEW.id, v_journal_id, v_company_id, v_cogs_acc, 0, v_valuation, 'COGS Rev: ' || COALESCE(v_product_name, 'Product')) ON CONFLICT DO NOTHING;
            END IF;
        ELSIF NEW.reference_type = 'ADJUSTMENT' THEN
            v_journal_id := 'JE-ADJ-' || replace(UPPER(NEW.reference_id), 'ADJ-', '');
            IF TG_OP = 'INSERT' THEN
                 SELECT data->>'contactId' INTO v_contact_id FROM docs_inventory_adjustments WHERE id = NEW.reference_id;
                 IF NEW.transaction_type = 'IN' THEN
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-I-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, v_valuation, 0, 'Stock Adjustment: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-E-' || NEW.id, v_journal_id, v_company_id, v_exp_acc, 0, v_valuation, 'Inventory Adjustment Expense: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                 ELSE
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-I-' || NEW.id, v_journal_id, v_company_id, v_inv_acc, 0, v_valuation, 'Stock Adjustment: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                     INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description, contact_id)
                     VALUES ('JL-' || v_journal_id || '-E-' || NEW.id, v_journal_id, v_company_id, v_exp_acc, v_valuation, 0, 'Inventory Adjustment Expense: ' || COALESCE(v_product_name, 'Product'), v_contact_id) ON CONFLICT DO NOTHING;
                 END IF;
            END IF;
        END IF;

        IF v_journal_id IS NULL THEN
            RETURN NEW;
        END IF;

        IF NEW.reference_type IN ('INVOICE', 'BILL', 'CREDIT_NOTE') THEN
            INSERT INTO docs_journals (id, company_id, date, status, updated_at)
            VALUES (v_journal_id, v_company_id, NEW.date, 'DRAFT', NOW())
            ON CONFLICT (id) DO NOTHING;
        ELSE
            INSERT INTO docs_journals (id, company_id, date, status, updated_at)
            VALUES (v_journal_id, v_company_id, NEW.date, 'POSTED', NOW())
            ON CONFLICT (id) DO NOTHING;
        END IF;

        RETURN NEW;
    END;
    $function$;
  `);
  console.log('Successfully updated post_inventory_ledger_lines().');

  // 3. Reconcile under 'replica' session role to avoid any blocking/locks or recursive trigger loops
  console.log('3. Engaging replica session_replication_role for full WAC/COGS database rebuild...');
  await c.query(`
    SET session_replication_role = 'replica';
  `);

  try {
    await c.query(`
      DO $$
      DECLARE
          prod RECORD;
          r RECORD;
          inv RECORD;
          line RECORD;
          cn RECORD;
          cn_line RECORD;
          v_total_qty NUMERIC;
          v_total_value NUMERIC;
          v_avg_cost NUMERIC;
          v_target_cost NUMERIC;
          v_valuation NUMERIC;
          v_journal_id TEXT;
          v_movement_id TEXT;
          v_cogs_acc TEXT;
          v_inv_acc TEXT;
      BEGIN
          RAISE NOTICE 'Rebuilding WAC sequentially...';
          -- A. Rebuild WAC costs inside Postgres for active products
          FOR prod IN (
              SELECT DISTINCT product_id, company_id 
              FROM docs_inventory_transactions 
              WHERE product_id IS NOT NULL AND company_id IS NOT NULL
          )
          LOOP
              v_total_qty := 0;
              v_total_value := 0;
              v_avg_cost := 0;

              FOR r IN (
                  SELECT transaction_type, quantity, cost_price, reference_type
                  FROM docs_inventory_transactions 
                  WHERE product_id = prod.product_id AND company_id = prod.company_id
                  ORDER BY date ASC, created_at ASC
              )
              LOOP
                  IF r.transaction_type = 'IN' THEN
                      IF r.reference_type IN ('BILL', 'ADJUSTMENT', 'OPENING_STOCK') THEN
                          v_total_qty := v_total_qty + COALESCE(r.quantity, 0);
                          v_total_value := v_total_value + (COALESCE(r.quantity, 0) * COALESCE(r.cost_price, 0));
                          IF v_total_qty > 0 THEN
                              v_avg_cost := v_total_value / v_total_qty;
                          END IF;
                      ELSE
                          v_total_qty := v_total_qty + COALESCE(r.quantity, 0);
                          v_total_value := v_total_qty * v_avg_cost;
                      END IF;
                  ELSIF r.transaction_type = 'OUT' THEN
                      IF r.reference_type = 'PURCHASE_RETURN' THEN
                          v_total_qty := v_total_qty - COALESCE(r.quantity, 0);
                          v_total_value := v_total_value - (COALESCE(r.quantity, 0) * COALESCE(r.cost_price, 0));
                          IF v_total_qty > 0 THEN
                              v_avg_cost := v_total_value / v_total_qty;
                          END IF;
                      ELSE
                          v_total_qty := v_total_qty - COALESCE(r.quantity, 0);
                          v_total_value := v_total_qty * v_avg_cost;
                      END IF;
                  END IF;
                  v_total_value := ROUND(v_total_value, 4);
              END LOOP;

              v_avg_cost := COALESCE(v_avg_cost, 0);

              -- Update product cost
              UPDATE docs_products
              SET cost_price = ROUND(v_avg_cost, 4),
                  data = jsonb_set(COALESCE(data, '{}'::jsonb), '{costPrice}', to_jsonb(ROUND(v_avg_cost, 4)))
              WHERE id = prod.product_id AND company_id = prod.company_id;

              -- Main Warehouse
              INSERT INTO docs_product_costs (id, company_id, product_id, warehouse_id, total_qty, total_value, avg_cost, updated_at)
              VALUES (prod.company_id || ':' || prod.product_id || ':main', prod.company_id, prod.product_id, 'main', v_total_qty, v_total_value, v_avg_cost, NOW())
              ON CONFLICT (id) DO UPDATE SET total_qty = EXCLUDED.total_qty, total_value = EXCLUDED.total_value, avg_cost = EXCLUDED.avg_cost, updated_at = NOW();

              -- Company Warehouse
              INSERT INTO docs_product_costs (id, company_id, product_id, warehouse_id, total_qty, total_value, avg_cost, updated_at)
              VALUES (prod.company_id || ':' || prod.product_id || ':wh-' || prod.company_id, prod.company_id, prod.product_id, 'wh-' || prod.company_id, v_total_qty, v_total_value, v_avg_cost, NOW())
              ON CONFLICT (id) DO UPDATE SET total_qty = EXCLUDED.total_qty, total_value = EXCLUDED.total_value, avg_cost = EXCLUDED.avg_cost, updated_at = NOW();
          END LOOP;

          RAISE NOTICE 'WAC sequential recalculation finished. Commencing invoice lines correction...';

          -- B. Correct Invoices and COGS entries
          FOR inv IN (
              SELECT id, company_id, status, invoice_number 
              FROM docs_invoices
              WHERE status IN ('POSTED', 'PAID', 'PARTIAL')
          )
          LOOP
              FOR line IN (
                  SELECT l.id, l.product_id, l.quantity, p.name as product_name
                  FROM docs_invoice_lines l
                  LEFT JOIN docs_products p ON l.product_id = p.id
                  WHERE l.invoice_id = inv.id AND l.type = 'PRODUCT' AND l.product_id IS NOT NULL
              )
              LOOP
                  -- Get target cost from the costs tables we rebuilt above
                  SELECT avg_cost INTO v_target_cost 
                  FROM docs_product_costs 
                  WHERE product_id = line.product_id AND company_id = inv.company_id AND warehouse_id = 'wh-' || inv.company_id;

                  IF v_target_cost IS NULL OR v_target_cost = 0 THEN
                      SELECT avg_cost INTO v_target_cost 
                      FROM docs_product_costs 
                      WHERE product_id = line.product_id AND company_id = inv.company_id AND warehouse_id = 'main';
                  END IF;

                  IF v_target_cost IS NULL OR v_target_cost = 0 THEN
                      SELECT COALESCE(cost_price, (data->>'costPrice')::numeric, 0) INTO v_target_cost
                      FROM docs_products
                      WHERE id = line.product_id AND company_id = inv.company_id;
                  END IF;

                  v_target_cost := COALESCE(v_target_cost, 0);

                  -- Update line
                  UPDATE docs_invoice_lines 
                  SET cost_price_at_sale = v_target_cost, company_id = inv.company_id
                  WHERE id = line.id;

                  -- Update movement cost
                  v_movement_id := 'mov-inv-' || inv.id || '-' || line.id;
                  UPDATE docs_inventory_transactions
                  SET cost_price = v_target_cost, company_id = inv.company_id
                  WHERE id = v_movement_id;

                  -- Delete previous journal line versions
                  v_journal_id := 'JE-' || replace(replace(UPPER(inv.id), 'INV-', ''), 'INVOICE-', '');
                  DELETE FROM docs_journal_lines 
                  WHERE id IN ('JL-' || v_journal_id || '-cogs-' || v_movement_id, 'JL-' || v_journal_id || '-inv-' || v_movement_id);

                  v_valuation := ROUND(COALESCE(line.quantity, 0) * v_target_cost, 2);
                  
                  IF v_valuation > 0 THEN
                      -- Target 500101 COGS Account specifically
                      SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100', '400501') AND company_id = inv.company_id LIMIT 1;
                      IF v_cogs_acc IS NULL THEN 
                          SELECT id INTO v_cogs_acc FROM docs_accounts WHERE (name ILIKE '%cost of goods%' OR name ILIKE '%cogs%' OR code ILIKE '5001%' OR code ILIKE '4005%') AND company_id = inv.company_id LIMIT 1; 
                      END IF;

                      -- Target 100501 Inventory Asset Account
                      SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = inv.company_id LIMIT 1;
                      IF v_inv_acc IS NULL THEN 
                          SELECT id INTO v_inv_acc FROM docs_accounts WHERE (name ILIKE '%inventory%' OR code ILIKE '1005%') AND company_id = inv.company_id LIMIT 1; 
                      END IF;

                      IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                          VALUES ('JL-' || v_journal_id || '-cogs-' || v_movement_id, v_journal_id, inv.company_id, v_cogs_acc, v_valuation, 0, 'COGS: ' || COALESCE(line.product_name, 'Product'))
                          ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit;

                          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                          VALUES ('JL-' || v_journal_id || '-inv-' || v_movement_id, v_journal_id, inv.company_id, v_inv_acc, 0, v_valuation, 'Inv Red: ' || COALESCE(line.product_name, 'Product'))
                          ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit;
                      END IF;
                  END IF;
              END LOOP;
          END LOOP;

          RAISE NOTICE 'Invoices completed. Correcting credit notes...';

          -- C. Reconcile Credit Notes
          FOR cn IN (
              SELECT id, company_id, status, credit_note_number 
              FROM docs_credit_notes
              WHERE status IN ('POSTED', 'PAID', 'PARTIAL')
          )
          LOOP
              FOR cn_line IN (
                  SELECT l.id, l.product_id, l.quantity, p.name as product_name
                  FROM docs_credit_note_lines l
                  LEFT JOIN docs_products p ON l.product_id = p.id
                  WHERE l.credit_note_id = cn.id AND l.type = 'PRODUCT' AND l.product_id IS NOT NULL
              )
              LOOP
                  SELECT avg_cost INTO v_target_cost 
                  FROM docs_product_costs 
                  WHERE product_id = cn_line.product_id AND company_id = cn.company_id AND warehouse_id = 'wh-' || cn.company_id;

                  IF v_target_cost IS NULL OR v_target_cost = 0 THEN
                      SELECT avg_cost INTO v_target_cost 
                      FROM docs_product_costs 
                      WHERE product_id = cn_line.product_id AND company_id = cn.company_id AND warehouse_id = 'main';
                  END IF;

                  IF v_target_cost IS NULL OR v_target_cost = 0 THEN
                      SELECT COALESCE(cost_price, (data->>'costPrice')::numeric, 0) INTO v_target_cost
                      FROM docs_products
                      WHERE id = cn_line.product_id AND company_id = cn.company_id;
                  END IF;

                  v_target_cost := COALESCE(v_target_cost, 0);

                  -- Update movement cost
                  v_movement_id := 'mov-cn-' || cn.id || '-' || cn_line.id;
                  UPDATE docs_inventory_transactions
                  SET cost_price = v_target_cost, company_id = cn.company_id
                  WHERE id = v_movement_id;

                  v_journal_id := 'JE-' || replace(replace(UPPER(cn.id), 'CN-', ''), 'CREDIT-', '');
                  DELETE FROM docs_journal_lines 
                  WHERE id IN ('JL-' || v_journal_id || '-inv-' || v_movement_id, 'JL-' || v_journal_id || '-cogs-' || v_movement_id);

                  v_valuation := ROUND(COALESCE(cn_line.quantity, 0) * v_target_cost, 2);
                  
                  IF v_valuation > 0 THEN
                      -- Resolve COGS Account
                      SELECT id INTO v_cogs_acc FROM docs_accounts WHERE code IN ('500101', '500100', '400501') AND company_id = cn.company_id LIMIT 1;
                      IF v_cogs_acc IS NULL THEN 
                          SELECT id INTO v_cogs_acc FROM docs_accounts WHERE (name ILIKE '%cost of goods%' OR name ILIKE '%cogs%' OR code ILIKE '5001%' OR code ILIKE '4005%') AND company_id = cn.company_id LIMIT 1; 
                      END IF;

                      -- Resolve Inventory Account
                      SELECT id INTO v_inv_acc FROM docs_accounts WHERE code = '100501' AND company_id = cn.company_id LIMIT 1;
                      IF v_inv_acc IS NULL THEN 
                          SELECT id INTO v_inv_acc FROM docs_accounts WHERE (name ILIKE '%inventory%' OR code ILIKE '1005%') AND company_id = cn.company_id LIMIT 1; 
                      END IF;

                      IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                          VALUES ('JL-' || v_journal_id || '-inv-' || v_movement_id, v_journal_id, cn.company_id, v_inv_acc, v_valuation, 0, 'Inv Add: ' || COALESCE(cn_line.product_name, 'Product'))
                          ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit;

                          INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, debit, credit, description)
                          VALUES ('JL-' || v_journal_id || '-cogs-' || v_movement_id, v_journal_id, cn.company_id, v_cogs_acc, 0, v_valuation, 'COGS Rev: ' || COALESCE(cn_line.product_name, 'Product'))
                          ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit;
                      END IF;
                  END IF;
              END LOOP;
          END LOOP;
          
          RAISE NOTICE 'Replica repairs executed successfully!';
      END;
      $$;
    `);
    console.log('REPLICA REPAIRS SUCCESSFULLY EXECUTED IN DATABASE!');
  } finally {
    console.log('4. Restoring origin session_replication_role...');
    await c.query(`
      SET session_replication_role = 'origin';
    `);
  }

  await c.end();
  console.log('--- MASTER COGS/WAC RECONCILIATION SUCCESSFULLY COMPLETED ---');
}

run().catch(console.error);
