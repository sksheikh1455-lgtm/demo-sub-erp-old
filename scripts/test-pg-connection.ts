import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function test() {
  const client = new Client({ connectionString });
  console.log('Connecting...');
  await client.connect();
  console.log('Connected! Querying SELECT 1...');
  const res = await client.query('SELECT 1 as num');
  console.log('Success!', res.rows);
  await client.end();
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
