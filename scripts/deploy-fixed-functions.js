import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Applying fixed post_invoice...");
  const postInvoiceSql = fs.readFileSync('scripts/update_post_invoice_cash_sale_v2.sql', 'utf8');
  await client.query(postInvoiceSql);
  console.log("fixed post_invoice deployed successfully.");

  await client.end();
}

run().catch(console.error);
