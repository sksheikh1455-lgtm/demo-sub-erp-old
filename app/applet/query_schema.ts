import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  const res = await c.query(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'docs_products';
  `);
  console.table(res.rows);
  
  const res2 = await c.query(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'docs_contacts';
  `);
  console.table(res2.rows);

  await c.end();
}
run();
