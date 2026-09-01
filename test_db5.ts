import { Client } from 'pg';
const client = new Client({
  connectionString: 'postgresql://postgres.buspgzsamhfmjrmmwpmo:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
});
async function run() {
  await client.connect();
  const res = await client.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'post_loan_payment_rpc' LIMIT 1`);
  console.log(res.rows[0].pg_get_functiondef);
  await client.end();
}
run();
