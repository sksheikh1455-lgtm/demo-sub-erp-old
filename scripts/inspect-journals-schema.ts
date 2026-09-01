import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'docs_journals';
  `);
  console.log('=== docs_journals schema ===');
  console.log(res.rows.map(r => `${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`));

  await client.end();
}
run().catch(console.error);
