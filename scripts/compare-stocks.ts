import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const productsRes = await client.query(`
    SELECT id, name, sku, quantity_on_hand, company_id
    FROM docs_products
  `);
  
  const txsRes = await client.query(`
    SELECT product_id, transaction_type, quantity
    FROM docs_inventory_transactions
  `);

  console.log(`Loaded ${productsRes.rows.length} products and ${txsRes.rows.length} transactions.`);

  const txMap: Record<string, { in: number, out: number }> = {};
  txsRes.rows.forEach(t => {
    const pid = t.product_id;
    if (!txMap[pid]) {
      txMap[pid] = { in: 0, out: 0 };
    }
    const qty = Number(t.quantity || 0);
    if (t.transaction_type === 'IN') {
      txMap[pid].in += qty;
    } else if (t.transaction_type === 'OUT') {
      txMap[pid].out += qty;
    }
  });

  const mismatches = [];
  for (const p of productsRes.rows) {
    const counts = txMap[p.id] || { in: 0, out: 0 };
    const calculated = counts.in - counts.out;
    const dbVal = Number(p.quantity_on_hand || 0);
    if (dbVal !== calculated) {
      mismatches.push({
        name: p.name,
        sku: p.sku,
        company: p.company_id,
        dbQoh: dbVal,
        calcQoh: calculated,
        totalIn: counts.in,
        totalOut: counts.out,
        diff: dbVal - calculated
      });
    }
  }

  console.log(`Found ${mismatches.length} products with stock mismatches.`);
  if (mismatches.length > 0) {
    console.log("Mismatches sample (up to 20):");
    console.log(mismatches.slice(0, 20));
  }

  await client.end();
}
run();
