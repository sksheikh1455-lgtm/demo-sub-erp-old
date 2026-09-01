import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select prosrc from pg_proc where proname = 'post_bill';
  `);
  if (res.rows.length) {
    console.log(res.rows[0].prosrc);
  }
  await client.end();
}
main();
