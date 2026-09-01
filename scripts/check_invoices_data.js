import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT id, data->>'preparedBy' as data_preparedBy, data->>'salesperson' as data_salesperson
    FROM docs_invoices 
    WHERE id = '7e468601-b9b2-429f-887b-9f698aac73a1';
  `);
  console.table(res.rows);
  await client.end();
}
main();
