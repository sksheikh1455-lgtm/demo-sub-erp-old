import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_DB_URL.replace('sk445@raihan', 'sk445%40raihan');
const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT code, name, company_id FROM docs_accounts LIMIT 20");
  console.log(res.rows);
  await client.end();
}
main();
