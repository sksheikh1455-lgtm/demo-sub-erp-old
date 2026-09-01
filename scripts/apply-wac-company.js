import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
CREATE OR REPLACE FUNCTION update_inventory_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_cost RECORD;
    v_new_qty NUMERIC;
    v_new_val NUMERIC;
    v_new_avg NUMERIC;
    v_id TEXT;
BEGIN
    -- Unique cost row per company-product-warehouse
    v_id := COALESCE(NEW.company_id, '') || ':' || COALESCE(NEW.product_id, '') || ':' || COALESCE(NEW.warehouse_id, '');

    -- Lock existing row for concurrency safety
    SELECT * INTO v_cost
    FROM docs_product_costs
    WHERE id = v_id
    FOR UPDATE;

    -- Initialize if not exists using COALESCE
    IF NOT FOUND THEN
        v_cost.total_qty := 0;
        v_cost.total_value := 0;
        v_cost.avg_cost := 0;
    ELSE
        v_cost.total_qty := COALESCE(v_cost.total_qty, 0);
        v_cost.total_value := COALESCE(v_cost.total_value, 0);
        v_cost.avg_cost := COALESCE(v_cost.avg_cost, 0);
    END IF;

    -- =========================
    -- IN (Purchase / Stock In)
    -- =========================
    IF NEW.transaction_type = 'IN' THEN
        
        v_new_qty := v_cost.total_qty + COALESCE(NEW.quantity, 0);
        v_new_val := COALESCE(v_cost.total_value, 0) + (COALESCE(NEW.quantity, 0) * COALESCE(NEW.cost_price, 0));

        IF v_new_qty > 0 THEN
            v_new_avg := v_new_val / v_new_qty;
        ELSE
            v_new_avg := 0;
        END IF;
        
        v_new_val := ROUND(v_new_val, 4);
        v_new_avg := ROUND(v_new_avg, 4);

    -- =========================
    -- OUT (Sale / Stock Out)
    -- =========================
    ELSIF NEW.transaction_type = 'OUT' THEN
        
        -- Prevent negative stock exception if needed otherwise just process
        IF v_cost.total_qty < NEW.quantity THEN
            -- ignoring rather than error to avoid breaking production invoice posting
        END IF;

        v_new_qty := v_cost.total_qty - COALESCE(NEW.quantity, 0);
        v_new_val := ROUND(COALESCE(v_cost.total_value, 0) - (COALESCE(NEW.quantity, 0) * COALESCE(v_cost.avg_cost, 0)), 4);

        -- Strict WAC Rule: avg_cost must not recalculate on OUT.
        v_new_avg := ROUND(COALESCE(v_cost.avg_cost, 0), 4);

    END IF;

    -- =========================
    -- UPSERT RESULT
    -- =========================
    INSERT INTO docs_product_costs (
        id, company_id, product_id, warehouse_id,
        total_qty, total_value, avg_cost, updated_at
    )
    VALUES (
        v_id,
        NEW.company_id,
        NEW.product_id,
        NEW.warehouse_id,
        v_new_qty,
        v_new_val,
        v_new_avg,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        total_qty = EXCLUDED.total_qty,
        total_value = EXCLUDED.total_value,
        avg_cost = EXCLUDED.avg_cost,
        updated_at = NOW();

    -- =========================
    -- UPDATE DOMAIN PRODUCT 
    -- =========================
    -- We update docs_products.cost_price so it is correctly reflected everywhere globally!
    UPDATE docs_products p
    SET cost_price = (
        SELECT CASE WHEN SUM(COALESCE(total_qty, 0)) > 0 THEN ROUND(SUM(COALESCE(total_value, 0)) / SUM(COALESCE(total_qty, 0)), 4) ELSE 0 END
        FROM docs_product_costs
        WHERE product_id = NEW.product_id AND company_id = NEW.company_id
    )
    WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
  `;

  await client.query(sql);

  // Backfill existing cost_price in docs_products
  const backfill = `
    UPDATE docs_products p
    SET cost_price = COALESCE((
        SELECT CASE WHEN SUM(COALESCE(total_qty, 0)) > 0 THEN ROUND(SUM(COALESCE(total_value, 0)) / SUM(COALESCE(total_qty, 0)), 4) ELSE 0 END
        FROM docs_product_costs
        WHERE product_id = p.id AND company_id = p.company_id
    ), 0)
    WHERE EXISTS (SELECT 1 FROM docs_product_costs WHERE product_id = p.id AND company_id = p.company_id);
  `;
  await client.query(backfill);

  console.log('Fixed WAC company logic successfully!');
  await client.end();
}

run().catch(console.error);
