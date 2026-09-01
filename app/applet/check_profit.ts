import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  const res = await c.query(`
    SELECT l.company_id, SUM(l.credit - l.debit) as profit
    FROM docs_journal_lines l
    JOIN docs_accounts a ON a.id = l.account_id
    WHERE a.data->>'type' IN ('REVENUE', 'EXPENSE')
    GROUP BY l.company_id
  `);
  console.table(res.rows);

  await c.end();
}
run();
