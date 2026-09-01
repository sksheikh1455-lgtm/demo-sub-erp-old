import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT id, date, prepared_by, created_by_id 
    FROM docs_journals 
    ORDER BY date DESC 
    LIMIT 10;
  `);
  console.table(res.rows);
  await client.end();
}
main();
