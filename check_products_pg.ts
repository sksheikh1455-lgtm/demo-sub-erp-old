import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT COUNT(*) FROM docs_products`);
  console.log('Products Count:', res.rows[0].count);
  
  const vendorRes = await client.query(`SELECT id, name FROM docs_contacts WHERE name ILIKE '%fiber%'`);
  console.log('Vendors:', vendorRes.rows);
  const vendorId = vendorRes.rows[0]?.id;

  if (vendorId) {
    const prodRes = await client.query(`SELECT id, name, quantity_on_hand, cost_price, data FROM docs_products WHERE data->>'preferredVendorId' = $1`, [vendorId]);
    console.log(`Products for vendor:`, prodRes.rows.length);
    if (prodRes.rows.length === 0) {
      const allProdRes = await client.query(`SELECT id, name, data FROM docs_products`);
      // check if any product has vendor related info
      const allProds = allProdRes.rows;
      const matching = allProds.filter(p => {
        const d = p.data;
        if (d && JSON.stringify(d).includes(vendorId)) return true;
        if (d && JSON.stringify(d).toLowerCase().includes('fiber')) return true;
        return false;
      });
      console.log('Products mentioning vendor in data:', matching.length);
      console.log(matching);
    }
  }

  await client.end();
}
run();
