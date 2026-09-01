import pkg from "pg";
const { Client } = pkg;
import crypto from 'crypto';

const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });

async function run() {
  try {
    await client.connect();
    
    const { rows: companies } = await client.query('SELECT id, data FROM docs_companies');
    
    let sourceId = null;
    let targetId = null;

    for (const c of companies) {
      if (c.data?.name === 'SUBORNO ELECTRIC' || (c.id === 'comp-1' && !sourceId && c.data?.name !== 'SUBORNO NEW')) {
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

    const { rows: products } = await client.query('SELECT * FROM docs_products WHERE company_id = $1', [sourceId]);
    console.log(`Found ${products.length} products to copy.`);

    let copiedCount = 0;
    for (const p of products) {
      const newId = crypto.randomUUID();
      const newData = { ...p.data };
      
      newData.companyId = targetId;
      newData.companyIds = [targetId];
      newData.company_id = targetId;
      newData.id = newId;

      newData.stock = 0;
      newData.openingStock = 0;
      newData.opening_stock = 0;
      newData.quantity = 0;
      newData.quantityOnHand = 0;
      newData.openingBalance = 0;
      newData.balance = 0;
      newData.stockLevels = { [targetId]: 0 };
      newData.initialStockLevels = { [targetId]: 0 };

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
