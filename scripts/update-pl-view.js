import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
  DROP VIEW IF EXISTS report_pl_summary;
  CREATE OR REPLACE VIEW report_pl_summary AS
  SELECT j.company_id,
    a.id AS account_id,
    upper((a.data ->> 'type'::text)) AS account_type,
    a.name AS account_name,
    a.code AS account_code,
    j.date,
    sum((al.debit - al.credit)) AS amount
   FROM ((docs_journal_lines al
     JOIN docs_journals j ON ((al.journal_id = j.id)))
     JOIN docs_accounts a ON ((al.account_id = a.id)))
  WHERE ((j.status = 'POSTED'::text) AND (upper((a.data ->> 'type'::text)) = ANY (ARRAY['INCOME'::text, 'REVENUE'::text, 'EXPENSE'::text, 'COST_OF_SALES'::text, 'COST_OF_REVENUE'::text, 'OTHER_INCOME'::text, 'OTHER_REVENUE'::text, 'OTHER_EXPENSE'::text])))
  GROUP BY j.company_id, a.id, (upper((a.data ->> 'type'::text))), a.name, a.code, j.date;
  `;

  await client.query(sql);
  console.log('View updated');
  await client.end();
}
run();
