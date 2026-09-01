import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function check() {
  await client.connect();
  const res = await client.query('SELECT id, quantity_on_hand, company_id, company_ids, data->>\'stockLevels\' as sl FROM docs_products LIMIT 5');
  console.log(res.rows);
  await client.end();
}

check().catch(console.error);
