import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT id, date, data->>'preparedBy' as prepared_by, data->>'createdById' as created_by_id 
    FROM docs_invoices 
    ORDER BY date DESC 
    LIMIT 10;
  `);
  console.table(res.rows);
  await client.end();
}
main();
