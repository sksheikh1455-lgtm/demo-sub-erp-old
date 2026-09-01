import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_invoices'
  `);
  
  console.log("Columns of docs_invoices:");
  for (const row of res.rows) {
    console.log(`- ${row.column_name}: ${row.data_type}`);
  }

  await client.end();
}
run();
