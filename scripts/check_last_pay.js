import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select * from docs_payments order by updated_at desc limit 1;
  `);
  console.log(res.rows[0]);
  await client.end();
}
main();
