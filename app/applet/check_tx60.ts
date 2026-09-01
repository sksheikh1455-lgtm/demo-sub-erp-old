import { Client } from 'pg';

async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const { rows: products } = await c.query(`
    SELECT id, name, company_id, data
    FROM docs_products
    WHERE name ILIKE '%TX60 PRO%'
  `);

  console.log('Products matching TX60 PRO:', products);

  if (products.length > 0) {
    const pid = products[0].id;
    const { rows: txs } = await c.query(`
      SELECT id, date, quantity, type, reference, company_id, data
      FROM docs_inventory_transactions
      WHERE product_id = $1
      ORDER BY date ASC, created_at ASC
    `, [pid]);
    console.log('Inventory transactions for product:', txs);
  }

  await c.end();
}
run();
