import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function check() {
  await client.connect();
  const res = await client.query('SELECT id, name, company_id, company_ids FROM docs_products LIMIT 10');
  console.log("Total in query:", res.rowCount);
  console.log("Rows:", res.rows);
  
  const res2 = await client.query('SELECT id, name FROM docs_companies');
  console.log("Companies:", res2.rows);

  const res3 = await client.query("SELECT COUNT(*) FROM docs_products WHERE 'comp-1' = ANY(company_ids)");
  console.log("Products for comp-1:", res3.rows[0].count);

  await client.end();
}

check().catch(console.error);
