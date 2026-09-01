import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  console.log('--- Inspecting Equity and Asset accounts for comp-1 ---');
  const res = await c.query(`
    SELECT id, code, name, type, sub_type 
    FROM docs_accounts 
    WHERE company_id = 'comp-1' AND (type IN ('EQUITY', 'ASSET', 'LIABILITY'))
    ORDER BY type, code
  `);
  console.table(res.rows);

  console.log('--- Inspecting Journal line elements for JE-LOAN-C0CB513B if any exists ---');
  const entryRes = await c.query("SELECT * FROM docs_journals WHERE id = 'JE-LOAN-C0CB513B' OR id ILIKE '%c0cb513b%'");
  console.log('Journal records:', entryRes.rows);

  if (entryRes.rows.length > 0) {
    const lines = await c.query("SELECT * FROM docs_journal_lines WHERE journal_id = $1", [entryRes.rows[0].id]);
    console.log('Journal lines:', lines.rows);
  }

  await c.end();
}
run();
