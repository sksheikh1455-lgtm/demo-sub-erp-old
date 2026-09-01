import { Client } from 'pg';
import crypto from 'crypto';

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres',
});

async function run() {
  await client.connect();

  try {
    // Get companies
    const { rows: companies } = await client.query('SELECT id, data FROM docs_companies');
    
    let sourceId = null;
    let targetId = null;

    for (const c of companies) {
      if (c.data?.name === 'SUBORNO ELECTRIC' || (c.id === 'comp-1' && !sourceId)) {
        sourceId = c.id;
      }
      if (c.data?.name === 'SUBORNO NEW') {
        targetId = c.id;
      }
    }

    console.log(`Source ID: ${sourceId}, Target ID: ${targetId}`);

    if (!sourceId || !targetId) {
      console.log('Could not find both companies.');
      return;
    }

    // First delete any products that already exist in target to avoid duplicates if ran multiple times
    await client.query('DELETE FROM docs_products WHERE company_id = $1', [targetId]);

    // Get source products
    const { rows: products } = await client.query('SELECT * FROM docs_products WHERE company_id = $1', [sourceId]);
    console.log(`Found ${products.length} products to copy.`);

    let copiedCount = 0;
    for (const p of products) {
      const newId = crypto.randomUUID();
      const newData = { ...p.data };
      
      // Update company IDs inside data
      newData.companyId = targetId;
      newData.company_id = targetId;
      newData.id = newId;

      // Ensure stock is 0
      newData.stock = 0;
      newData.openingStock = 0;
      newData.opening_stock = 0;
      newData.quantity = 0;

      // Insert new product
      await client.query(
        'INSERT INTO docs_products (id, data, updated_at, company_id) VALUES ($1, $2, NOW(), $3)',
        [newId, newData, targetId]
      );
      copiedCount++;
    }

    console.log(`Successfully copied ${copiedCount} products with 0 stock.`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
