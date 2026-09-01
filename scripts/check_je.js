import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  let res = await client.query(`
    SELECT id, status, reference FROM docs_journals WHERE id = 'JE-LOAN-C0CB513B' OR reference_number = 'JE-LOAN-C0CB513B'
  `);
  console.log("Journal:", res.rows);

  await client.end();
}
run();
