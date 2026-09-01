import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function check() {
  await client.connect();
  const compIds = ['comp-2'];
  
  // What is the structure of docs_products?
  const res3 = await client.query("SELECT id, name, company_id, company_ids FROM docs_products WHERE company_id = ANY($1) OR company_ids && $1;", [compIds]);
  console.log("Products in comp-2 via &&:", res3.rowCount);
  
  if (res3.rowCount > 0) console.log(res3.rows[0]);
  
  await client.end();
}

check().catch(console.error);
