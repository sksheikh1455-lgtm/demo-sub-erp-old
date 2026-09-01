import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function recalculateCosts() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log('Starting global cost/valuation recalculation...');

    // 1. Get all products
    const { rows: products } = await client.query("SELECT id, data FROM docs_products");
    
    for (const prod of products) {
      console.log(`Recalculating costs for product: ${prod.id}`);
      
      const { rows: transactions } = await client.query(`
        SELECT transaction_type, quantity, cost_price, reference_type, warehouse_id, company_id
        FROM docs_inventory_transactions
        WHERE product_id = $1
        ORDER BY date ASC, created_at ASC
      `, [prod.id]);

      // We need to group by (company, warehouse)
      const groups: Record<string, { qty: number, val: number, avg: number }> = {};
      const baseCost = parseFloat(prod.data.costPrice || 0);

      for (const t of transactions) {
        const key = `${t.company_id}:${t.warehouse_id}`;
        if (!groups[key]) groups[key] = { qty: 0, val: 0, avg: baseCost };
        
        const g = groups[key];
        const qty = parseFloat(t.quantity || 0);
        const cost = parseFloat(t.cost_price || 0);

        if (t.transaction_type === 'IN') {
           if (['BILL', 'ADJUSTMENT', 'OPENING_STOCK'].includes(t.reference_type)) {
              g.val += (qty * cost);
              g.qty += qty;
              if (g.qty > 0) g.avg = g.val / g.qty;
           } else {
              g.qty += qty;
              g.val = g.qty * g.avg;
           }
        } else {
            if (t.reference_type === 'PURCHASE_RETURN') {
                g.val -= (qty * cost);
                g.qty -= qty;
                if (g.qty > 0) g.avg = g.val / g.qty;
            } else {
                g.qty -= qty;
                g.val = g.qty * g.avg;
            }
        }
      }

      // Update docs_product_costs for each group
      let globalAvgSum = 0;
      let globalQtySum = 0;
      let groupCount = 0;

      for (const [key, g] of Object.entries(groups)) {
        const [cid, wid] = key.split(':');
        const costId = `${cid}:${prod.id}:${wid}`;
        
        await client.query(`
          INSERT INTO docs_product_costs (id, company_id, product_id, warehouse_id, total_qty, total_value, avg_cost, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE SET 
            total_qty = EXCLUDED.total_qty,
            total_value = EXCLUDED.total_value,
            avg_cost = EXCLUDED.avg_cost,
            updated_at = NOW()
        `, [costId, cid, prod.id, wid, g.qty, g.val, g.avg]);

        if (g.qty > 0) {
            globalAvgSum += g.avg;
            globalQtySum += g.qty;
            groupCount++;
        }
      }

      // Optional: Update main product cost price to the latest weighted average across all warehouses?
      // For now, let's just make sure the product record's costPrice is somewhat sane
      const newCostPrice = groupCount > 0 ? (globalAvgSum / groupCount) : baseCost;
      
      await client.query(`
        UPDATE docs_products
        SET data = jsonb_set(data, '{costPrice}', $1::jsonb),
            updated_at = NOW()
        WHERE id = $2
      `, [newCostPrice, prod.id]);
    }

    console.log('Recalculation complete.');
  } catch (err) {
    console.error('Error during recalculation:', err);
  } finally {
    await client.end();
  }
}

recalculateCosts();
