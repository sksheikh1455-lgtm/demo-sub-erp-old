import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
CREATE OR REPLACE FUNCTION rebuild_wac_for_product(p_company_id TEXT, p_product_id TEXT)
RETURNS VOID AS $$
DECLARE
    tx RECORD;
    v_total_qty NUMERIC := 0;
    v_total_value NUMERIC := 0;
    v_avg_cost NUMERIC := 0;
BEGIN
    FOR tx IN (
        SELECT *
        FROM docs_inventory_transactions 
        WHERE company_id = p_company_id AND product_id = p_product_id
        ORDER BY date ASC, updated_at ASC
    )
    LOOP
        IF tx.transaction_type = 'IN' THEN
            v_total_qty := v_total_qty + COALESCE(tx.quantity, 0);
            v_total_value := v_total_value + (COALESCE(tx.quantity, 0) * COALESCE(tx.cost_price, 0));
            IF v_total_qty > 0 THEN
                v_avg_cost := ROUND(v_total_value / v_total_qty, 4);
            ELSE
                v_avg_cost := 0;
            END IF;
        ELSIF tx.transaction_type = 'OUT' THEN
            v_total_qty := v_total_qty - COALESCE(tx.quantity, 0);
            v_total_value := v_total_value - (COALESCE(tx.quantity, 0) * v_avg_cost);
        END IF;

        v_total_value := ROUND(v_total_value, 4);
    END LOOP;

    -- Update docs_products cost_price directly
    UPDATE docs_products
    SET cost_price = v_avg_cost
    WHERE id = p_product_id AND company_id = p_company_id;

    -- Update the product_costs table (aggregate, we can just use main or a fixed string)
    INSERT INTO docs_product_costs (
        id, company_id, product_id, warehouse_id,
        total_qty, total_value, avg_cost, updated_at
    )
    VALUES (
        p_company_id || ':' || p_product_id || ':main',
        p_company_id,
        p_product_id,
        'main',
        v_total_qty,
        v_total_value,
        v_avg_cost,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        total_qty = EXCLUDED.total_qty,
        total_value = EXCLUDED.total_value,
        avg_cost = EXCLUDED.avg_cost,
        updated_at = NOW();

END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_rebuild_wac()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM rebuild_wac_for_product(OLD.company_id, OLD.product_id);
        RETURN OLD;
    ELSE
        PERFORM rebuild_wac_for_product(NEW.company_id, NEW.product_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_inventory_cost ON docs_inventory_transactions;
DROP TRIGGER IF EXISTS trg_update_average_cost ON docs_inventory_transactions;
DROP TRIGGER IF EXISTS trg_rebuild_wac_after_change ON docs_inventory_transactions;

CREATE TRIGGER trg_rebuild_wac_after_change 
AFTER INSERT OR UPDATE OR DELETE ON docs_inventory_transactions 
FOR EACH ROW EXECUTE FUNCTION trg_rebuild_wac();
  `;

  await client.query(sql);

  // Now, fire it manually to recalculate everything!
  const rebuildAll = `
  SELECT rebuild_wac_for_product(company_id, product_id)
  FROM (SELECT DISTINCT company_id, product_id FROM docs_inventory_transactions) t;
  `;
  await client.query(rebuildAll);

  console.log('Fixed WAC with robust rebuild trigger!');
  await client.end();
}

run().catch(console.error);
