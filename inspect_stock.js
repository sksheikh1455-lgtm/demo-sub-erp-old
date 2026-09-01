import pg from 'pg';
import fs from 'fs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = env.match(/SUPABASE_DB_URL=(.+)/);
  if (!dbUrlMatch) throw new Error("No db url");
  const url = dbUrlMatch[1].trim().replace(/^"|"$/g, '').replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const pid = '4354c4cb-e78c-4922-ba60-2700dab65fd2';
  
  console.log("=== docs_products ===");
  try {
    let r1 = await client.query("SELECT id, name, data->>'quantityOnHand' as qoh FROM docs_products WHERE id = $1", [pid]);
    console.log(r1.rows);
  } catch(e) { console.log(e.message); }

  console.log("=== docs_product_stocks ===");
  try {
    let r2 = await client.query("SELECT product_id, warehouse_id, quantity, reserved_quantity, available_quantity FROM docs_product_stocks WHERE product_id = $1", [pid]);
    console.log(r2.rows);
  } catch(e) { console.log(e.message); }

  console.log("=== docs_stock_movements / docs_inventory_transactions ===");
  try {
    let r3 = await client.query("SELECT sum(quantity) as net_qty FROM docs_inventory_transactions WHERE product_id = $1", [pid]);
    console.log("From transactions:", r3.rows[0]);
  } catch(e) { console.log(e.message); }

  console.log("=== docs_product_costs ===");
  try {
    let r4 = await client.query("SELECT product_id, qty_on_hand FROM docs_product_costs WHERE product_id = $1", [pid]);
    console.log(r4.rows);
  } catch(e) { console.log(e.message); }

  console.log("=== product_stock_levels (View?) ===");
  try {
    let r5 = await client.query("SELECT * FROM product_stock_levels WHERE product_id = $1", [pid]);
    console.log(r5.rows);
  } catch(e) { console.log(e.message); }

  console.log("=== report_stock_valuation (View?) ===");
  try {
    let r6 = await client.query("SELECT * FROM report_stock_valuation WHERE product_id = $1", [pid]);
    console.log(r6.rows);
  } catch(e) { console.log(e.message); }

  await client.end();
}
main();
