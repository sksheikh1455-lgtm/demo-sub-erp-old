import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res1 = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'docs_bills';
  `);
  console.log('=== docs_bills schema ===');
  console.log(res1.rows.map(r => `${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`));

  const res2 = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'docs_invoices';
  `);
  console.log('=== docs_invoices schema ===');
  console.log(res2.rows.map(r => `${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`));

  await client.end();
}
run().catch(console.error);
