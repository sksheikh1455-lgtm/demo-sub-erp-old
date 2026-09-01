import pkg from 'pg';
const { Client } = pkg;

async function test() {
  const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres';
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT routine_definition FROM information_schema.routines WHERE routine_name = 'post_payment'");
  console.log(res.rows[0]?.routine_definition);
  await client.end();
}
test();
