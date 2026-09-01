import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`
    SELECT * FROM docs_bills WHERE bill_number = 'BIL-SUL-000336' OR data->>'number' = 'BIL-SUL-000336' LIMIT 1;
  `);
  console.log("Bill:", res.rows[0]);
  if (res.rows[0]) {
      const resLines = await client.query(`
        SELECT * FROM docs_bill_lines WHERE bill_id = $1;
      `, [res.rows[0].id]);
      console.log("Bill Lines:", resLines.rows);
      
      const resInv = await client.query(`
        SELECT * FROM docs_inventory_transactions WHERE reference_id = $1;
      `, [res.rows[0].id]);
      console.log("Inventory Trans:", resInv.rows);
  }
  await client.end();
}
run();
