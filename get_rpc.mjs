import pkg from 'pg';
const { Client } = pkg;
const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'get_general_ledger'
  `);
  console.log(res.rows[0]?.prosrc);
  await client.end();
}
run().catch(console.error);
