import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT j.id as journal_id, j.status, j.date, a.name, a.type, jl.debit, jl.credit
    FROM docs_journal_lines jl
    JOIN docs_journals j ON j.id = jl.journal_id
    JOIN docs_accounts a ON a.id = jl.account_id
    WHERE a.type IN ('EXPENSE', 'COST_OF_REVENUE')
    LIMIT 20;
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run();
