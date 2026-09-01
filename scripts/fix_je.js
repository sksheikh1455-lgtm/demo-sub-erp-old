import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");
    
    await client.query("UPDATE docs_journals SET status = 'DRAFT' WHERE id = 'JE-LOAN-C0CB513B'");
    // Delete old journal lines
    await client.query("DELETE FROM docs_journal_lines WHERE journal_id = 'JE-LOAN-C0CB513B'");
    // Delete old journal
    await client.query("DELETE FROM docs_journals WHERE id = 'JE-LOAN-C0CB513B'");

    // Find Owner's Equity account
    let res = await client.query("SELECT id FROM docs_accounts WHERE code = '300100' AND company_id = 'comp-1'");
    let equityAccountId = res.rows.length > 0 ? res.rows[0].id : 'comp-1-300100';

    // Insert new Journal Entry
    let newJeId = 'JE-REC-' + Date.now();
    await client.query(`
      INSERT INTO docs_journals (id, company_id, journal_number, date, journal_type, status, description)
      VALUES ($1, 'comp-1', 'JE-REC-EMSG-001', '2026-06-04', 'OPENING_BALANCE', 'POSTED', 'Opening Balance: Monthly Savings / Loan Receivable')
    `, [newJeId]);

    // Insert DEBIT line for Loan Receivable (acc-emsg-loan-rec)
    await client.query(`
      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
      VALUES (gen_random_uuid(), $1, 'comp-1', 'acc-emsg-loan-rec', 'c0cb513b-54d7-4f1e-9d05-48abfd79cb3a', 17000, 0, 'Opening Balance: Monthly Savings')
    `, [newJeId]);

    // Insert CREDIT line for Owner's Equity
    await client.query(`
      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
      VALUES (gen_random_uuid(), $1, 'comp-1', $2, 'c0cb513b-54d7-4f1e-9d05-48abfd79cb3a', 0, 17000, 'Opening Balance: Owner Equity')
    `, [newJeId, equityAccountId]);

    await client.query("COMMIT");
    console.log("Reversed and created new JE!");
  } catch(e) {
    await client.query("ROLLBACK");
    console.error(e);
  }

  await client.end();
}
run();
