import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
-- =========================================
-- 1. DROP OLD TRIGGER & FUNCTION 
-- =========================================
DROP TRIGGER IF EXISTS trg_update_inventory_cost ON docs_inventory_transactions;
DROP FUNCTION IF EXISTS update_inventory_cost;

-- =========================================
-- 2. CREATE FUNCTION (INCREMENTAL WAC)
-- =========================================
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
            RAISE EXCEPTION 'Insufficient stock for product %', NEW.product_id;
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- 3. CREATE TRIGGER
-- =========================================
CREATE TRIGGER trg_update_inventory_cost
AFTER INSERT ON docs_inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION update_inventory_cost();

-- =========================================
-- 4. STOCK VALUATION VIEW 
-- =========================================
DROP VIEW IF EXISTS report_stock_valuation;

CREATE VIEW report_stock_valuation AS
SELECT 
    p.company_id,
    p.id AS product_id,
    p.name AS product_name,
    COALESCE(p.sku, '') AS sku,

    COALESCE(pc.total_qty, 0) AS on_hand_qty,
    COALESCE(pc.total_value, 0) AS total_value,
    COALESCE(pc.avg_cost, 0) AS avg_cost

FROM docs_products p
LEFT JOIN (
    SELECT 
        company_id,
        product_id,
        SUM(COALESCE(total_qty, 0)) AS total_qty,
        SUM(COALESCE(total_value, 0)) AS total_value,
        MAX(COALESCE(avg_cost, 0)) AS avg_cost
    FROM docs_product_costs
    GROUP BY company_id, product_id
) pc
ON p.id = pc.product_id
AND p.company_id = pc.company_id;

  `;

  await client.query(sql);
  console.log('Fixed WAC logic successfully!');
  await client.end();
}

run().catch(console.error);
