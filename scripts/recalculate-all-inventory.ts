import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function recalculateInventory() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log('Starting global inventory recalculation...');

    // 1. Get all products
    const { rows: products } = await client.query("SELECT id FROM docs_products");
    
    for (const prod of products) {
      console.log(`Recalculating for product: ${prod.id}`);
      
      // Calculate stock per company and warehouse
      const { rows: stocks } = await client.query(`
        SELECT 
          company_id, 
          warehouse_id,
          SUM(CASE WHEN transaction_type = 'IN' THEN quantity ELSE -quantity END) as total_qty
        FROM docs_inventory_transactions
        WHERE product_id = $1
        GROUP BY company_id, warehouse_id
      `, [prod.id]);

      const stockLevels: Record<string, number> = {};
      let totalQoh = 0;

      for (const s of stocks) {
        const qty = parseFloat(s.total_qty || 0);
        stockLevels[s.company_id] = (stockLevels[s.company_id] || 0) + qty;
        totalQoh += qty;
      }

      // Update product record
      await client.query(`
        UPDATE docs_products
        SET quantity_on_hand = $4,
        data = jsonb_set(
          jsonb_set(
            data,
            '{stockLevels}',
            $1::jsonb
          ),
          '{quantityOnHand}',
          $2::jsonb
        ),
        updated_at = NOW()
        WHERE id = $3
      `, [JSON.stringify(stockLevels), totalQoh, prod.id, totalQoh]);
    }

    console.log('Recalculation complete.');
  } catch (err) {
    console.error('Error during recalculation:', err);
  } finally {
    await client.end();
  }
}

recalculateInventory();
