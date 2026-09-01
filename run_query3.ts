import { Client } from 'pg';
const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres'
});
async function run() {
  await client.connect();
  const res = await client.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'post_loan_payment_rpc' LIMIT 1`);
  console.log(res.rows[0].pg_get_functiondef);
  await client.end();
}
run();
