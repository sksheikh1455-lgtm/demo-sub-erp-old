import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_trial_balance'");
  console.log(res.rows[0].pg_get_functiondef);
  await client.end();
}
run();
