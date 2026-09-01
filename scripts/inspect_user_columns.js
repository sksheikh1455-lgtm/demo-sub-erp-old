import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("=== INSPECTING COLUMNS ===");
  const res = await client.query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name IN ('docs_payments', 'docs_invoices', 'docs_bills', 'docs_journals')
      AND column_name IN ('created_by_id', 'prepared_by', 'preparedBy')
  `);
  
  res.rows.forEach(r => {
    console.log(`Table: ${r.table_name}, Col: ${r.column_name}, Type: ${r.data_type}`);
  });

  await client.end();
}

run().catch(console.error);
