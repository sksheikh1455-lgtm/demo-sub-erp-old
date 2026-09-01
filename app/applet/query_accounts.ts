import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  const res = await c.query(`
    SELECT id, company_id, data->>'code' as code, data->>'name' as name, data->>'type' as type 
    FROM docs_accounts 
    WHERE data->>'type' IN ('EXPENSE', 'EQUITY', 'REVENUE')
  `);
  console.table(res.rows);

  await c.end();
}
run();
