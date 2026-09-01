import pkg from "pg";
const { Client } = pkg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const { rows: companies } = await client.query('SELECT id, data FROM docs_companies');
  let sourceId = null;
  let targetId = null;
  for (const c of companies) {
    if (c.data?.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1') sourceId = c.id;
    if (c.data?.name === 'SUBORNO NEW') targetId = c.id;
  }
  
  const { rows: brands } = await client.query('SELECT * FROM docs_brands WHERE company_id = $1', [sourceId]);
  const { rows: cats } = await client.query('SELECT * FROM docs_categories WHERE company_id = $1', [sourceId]);
  
  console.log(`Source ID: ${sourceId}, Target ID: ${targetId}`);
  console.log(`Brands in source: ${brands.length}`);
  console.log(`Cats in source: ${cats.length}`);
  
  if (brands.length > 0) console.log("Sample brand:", brands[0].data);
  if (cats.length > 0) console.log("Sample cat:", cats[0].data);
  
  await client.end();
}
run();
