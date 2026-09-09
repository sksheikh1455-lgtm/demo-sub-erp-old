import { Client } from 'pg';
const client = new Client({
  connectionString: "postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres"
});
async function run() {
  await client.connect();
  const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
  console.log("Tables:", res.rows.map(r => r.table_name));
  await client.end();
}
run();
