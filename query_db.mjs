import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  
  // Search journals
  const res = await client.query(`SELECT id, reference, status, author_id, created_at, company_id FROM docs_journals WHERE reference ILIKE '%001175%'`);
  console.log("Journals:", res.rows);

  const res2 = await client.query(`SELECT id, reference, status, author_id, created_at, company_id FROM docs_payments WHERE reference ILIKE '%001175%'`);
  console.log("Payments:", res2.rows);

  await client.end();
}

run().catch(console.error);
