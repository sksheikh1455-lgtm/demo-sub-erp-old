import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  const contactId = 'c0cb513b-54d7-4f1e-9d05-48abfd79cb3a';

  console.log('--- Finding all transactions for contact ---');
  const res = await c.query(`
    SELECT jl.id, jl.journal_id, j.date, jl.account_id, a.code, a.name, jl.debit, jl.credit, jl.description
    FROM docs_journal_lines jl
    JOIN docs_journals j ON jl.journal_id = j.id
    JOIN docs_accounts a ON jl.account_id = a.id
    WHERE jl.contact_id = $1 OR jl.description ILIKE '%ELECTRIC MALIK%'
    ORDER BY j.date ASC
  `, [contactId]);
  console.table(res.rows);

  await c.end();
}
run();
