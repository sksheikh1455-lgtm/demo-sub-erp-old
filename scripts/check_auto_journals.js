import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    select data->>'preparedBy' as prep, data->>'createdById' as cid from docs_journals where id LIKE 'JE-CPAY-%' order by updated_at desc limit 10;
  `);
  console.table(res.rows);
  await client.end();
}
main();
