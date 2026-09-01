import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  const res1 = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_invoices';
  `);
  console.log("=== COLUMNS of docs_invoices ===");
  res1.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  const res2 = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_bills';
  `);
  console.log("=== COLUMNS of docs_bills ===");
  res2.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  await c.end();
}

run();
