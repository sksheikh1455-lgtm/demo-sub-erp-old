import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'docs_journals';
  `);
  console.log(res.rows.map(r => r.column_name));
  await client.end();
}
main();
