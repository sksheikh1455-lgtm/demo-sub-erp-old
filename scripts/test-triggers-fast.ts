import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Setting statement_timeout to 2 seconds...');
  await client.query('SET statement_timeout = 2000');

  console.log('=== CHECKING ACTIVE TRANSACTIONS / LOCKS ===');
  try {
    const locks = await client.query(`
      SELECT pid, age(clock_timestamp(), query_start), usename, state, query 
      FROM pg_stat_activity 
      WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%';
    `);
    console.log('Active queries/locks:', locks.rows);
  } catch (err: any) {
    console.error('Failed to query active locks:', err.message);
  }

  console.log('=== RUNNING A SIMPLE SELECT FOR TEST_BILL ===');
  try {
    const res = await client.query('SELECT id, status FROM docs_bills LIMIT 5');
    console.log('Found bills:', res.rows);
  } catch (err: any) {
    console.error('Failed to queries bills:', err.message);
  }

  await client.end();
}
run().catch(console.error);
