import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const functions = [
    'audit_log_trigger',
    'block_delete_posted',
    'increment_version',
    'generate_document_numbers',
    'enforce_accounting_immutability',
    'generate_inventory_movements',
    'sync_document_metadata'
  ];

  for (const fn of functions) {
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = $1
    `, [fn]);
    if (res.rows.length > 0) {
      console.log(`\n=======================================\nDefinition of ${fn}:\n=========================================`);
      console.log(res.rows[0].prosrc);
    } else {
      console.log(`\n${fn} not found!`);
    }
  }

  await client.end();
}
run();
