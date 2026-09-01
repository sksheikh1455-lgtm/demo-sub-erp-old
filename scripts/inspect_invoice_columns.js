import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const tables = ['docs_invoices', 'docs_payments', 'docs_credit_notes', 'docs_bills'];
  for (const table of tables) {
    console.log(`---- ${table} Columns ----`);
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1;
    `, [table]);
    colsRes.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type}`);
    });
    console.log("-------------------------\n");
  }

  await client.end();
}

run().catch(console.error);
