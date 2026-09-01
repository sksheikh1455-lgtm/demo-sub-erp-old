import pkg from "pg";
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  await c.query(`
    CREATE OR REPLACE VIEW docs_partner_ledger_view AS
    SELECT j.date,
           c.name AS partner_name,
           COALESCE(j.reference_number, j.journal_number) AS document_no,
           COALESCE(jl.description, j.description, ''::text) AS description,
           COALESCE(jl.debit, (0)::numeric) AS debit,
           COALESCE(jl.credit, (0)::numeric) AS credit,
           sum((COALESCE(jl.debit, (0)::numeric) - COALESCE(jl.credit, (0)::numeric))) OVER (PARTITION BY jl.company_id, jl.contact_id ORDER BY j.date, j.created_at, jl.id) AS partner_running_balance,
           jl.id AS line_id,
           jl.journal_id,
           jl.company_id,
           jl.account_id,
           jl.contact_id,
           c.type AS partner_type
    FROM docs_journal_lines jl
    JOIN docs_journals j ON jl.journal_id = j.id
    JOIN docs_contacts c ON jl.contact_id = c.id
    JOIN docs_accounts a ON jl.account_id = a.id
    WHERE j.status = 'POSTED'
      AND jl.contact_id IS NOT NULL
      AND (
          a.code IN ('200101', '100201', '1101') 
          OR a.code LIKE '210100%' 
          OR a.name ILIKE '%loan%payable%' 
          OR a.name ILIKE '%loan%receivable%'
          OR a.name ILIKE '%advance%'
      );
  `);
  
  console.log("View updated!");
  
  const q = await c.query(`
      SELECT document_no, account_id, debit, credit 
      FROM docs_partner_ledger_view 
      WHERE journal_id = 'JE-CPAY-E927725C-0F27-4F93-9D60-9E6F61D27ACE'
  `);
  console.log("Now in partner ledger for that payment:", q.rows);
  
  process.exit();
}
run();
