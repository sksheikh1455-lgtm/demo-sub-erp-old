import { Client } from 'pg';
const client = new Client({
  connectionString: 'postgresql://postgres.buspgzsamhfmjrmmwpmo:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
});
async function run() {
  await client.connect();
  const res = await client.query(`SELECT 1;`);
  console.log(res.rows);
  await client.end();
}
run();
