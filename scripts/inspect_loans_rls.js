import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  let res = await client.query(`
    SELECT id, name, code, type FROM docs_accounts WHERE name ILIKE '%Opening Loan%' OR name ILIKE '%Baccho%' LIMIT 10
  `);
  console.log("Policies for docs_loans:", res.rows);

  await client.end();
}
run();
