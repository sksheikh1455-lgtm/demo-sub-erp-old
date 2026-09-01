import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  let fnRes = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'get_general_ledger_report'`);
  let def = fnRes.rows[0].def;
  
  // 1. Add FULL_REFUNDED, PARTIAL_REFUNDED to INVOICE status
  def = def.replace(/i\.status IN \('POSTED', 'PAID', 'PARTIAL'\)/g, 
    "i.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')");

  // 2. Add FULL_REFUNDED, PARTIAL_REFUNDED to BILL status
  def = def.replace(/b\.status IN \('POSTED', 'PAID', 'PARTIAL'\)/g, 
    "b.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')");
    
  // 3. Update the docs_payments cash impact logic
  def = def.split("COALESCE(p.data->>'journalEntryId', p.data->>'journal_entry_id', 'JE-CPAY-' || REPLACE(UPPER(p.id), 'PAY-', ''))").join( 
    "COALESCE(p.data->>'journalEntryId', p.data->>'journal_entry_id', (SELECT id FROM docs_journals tj WHERE tj.id IN ('JE-CPAY-' || REPLACE(UPPER(p.id), 'PAY-', ''), 'JE-VPAY-' || REPLACE(UPPER(p.id), 'PAY-', ''), 'JE-PAY-' || REPLACE(UPPER(p.id), 'PAY-', ''), 'JE-' || REPLACE(UPPER(p.id), 'PAY-', '')) LIMIT 1))"
  );
  
  // 4. Update the NOT IN clause
  def = def.replace(/SELECT COALESCE\(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id', ''\) FROM docs_invoices WHERE company_id = \$1/g,
    "SELECT COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') FROM docs_invoices WHERE company_id = $1 AND status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') AND COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL");
    
  def = def.replace(/SELECT COALESCE\(data->>'journalEntryId', data->>'journal_entry_id', ''\) FROM docs_credit_notes WHERE company_id = \$1/g,
    "SELECT COALESCE(data->>'journalEntryId', data->>'journal_entry_id') FROM docs_credit_notes WHERE company_id = $1 AND status IN ('POSTED', 'CLOSED') AND COALESCE(data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL");

  def = def.replace(/SELECT COALESCE\(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id'\) FROM docs_bills WHERE company_id = \$1 AND COALESCE\(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id'\) IS NOT NULL/g,
    "SELECT COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') FROM docs_bills WHERE company_id = $1 AND status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') AND COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL");

  def = def.replace(/UNION ALL\s+SELECT COALESCE\(data->>'journalEntryId', data->>'journal_entry_id', 'JE-CPAY-' \|\| REPLACE\(UPPER\(id\), 'PAY-', ''\)\) FROM docs_payments WHERE company_id = \$1\s+UNION ALL\s+SELECT 'JE-VPAY-' \|\| REPLACE\(UPPER\(id\), 'PAY-', ''\) FROM docs_payments WHERE company_id = \$1\s+UNION ALL\s+SELECT 'JE-PAY-' \|\| REPLACE\(UPPER\(id\), 'PAY-', ''\) FROM docs_payments WHERE company_id = \$1\s+UNION ALL\s+SELECT 'JE-' \|\| REPLACE\(UPPER\(id\), 'PAY-', ''\) FROM docs_payments WHERE company_id = \$1/g,
  ""
  );
  
  def = def.replace(/UNION ALL\s*SELECT COALESCE\(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id'\) FROM docs_bills WHERE company_id = \$1 AND status IN \('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED'\) AND COALESCE\(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id'\) IS NOT NULL/g,
  "UNION ALL\n               SELECT COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') FROM docs_bills WHERE company_id = $1 AND status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') AND COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL\n               UNION ALL\n               SELECT COALESCE(data->>'journalEntryId', data->>'journal_entry_id', (SELECT id FROM docs_journals tj WHERE tj.id IN ('JE-CPAY-' || REPLACE(UPPER(p.id), 'PAY-', ''), 'JE-VPAY-' || REPLACE(UPPER(p.id), 'PAY-', ''), 'JE-PAY-' || REPLACE(UPPER(p.id), 'PAY-', ''), 'JE-' || REPLACE(UPPER(p.id), 'PAY-', '')) LIMIT 1)) FROM docs_payments p WHERE p.company_id = $1 AND p.status = 'POSTED'"
  );

  await client.query(def);
  console.log("Function applied!");
  
  const fnRes2 = await client.query(`
    SELECT SUM(cash_impact) FROM get_general_ledger_report('comp-1', '2020-01-01', '2030-01-01')
  `);
  
  console.log('Resulting sum:', fnRes2.rows);

  client.end();
}
main();
