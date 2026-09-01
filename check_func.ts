import { Client } from 'pg';
const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});
async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname = 'get_dashboard_summary';
  `);
  console.log(res.rows[0].pg_get_functiondef);
  await client.end();
}
main();
