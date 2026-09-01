import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'docs_invoices'
  `);
  
  console.log("Nullability of docs_invoices columns:");
  for (const row of res.rows) {
    console.log(`- ${row.column_name}: Nullable? ${row.is_nullable}`);
  }

  await client.end();
}
run();
