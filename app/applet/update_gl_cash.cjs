const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  let fnRes = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'get_general_ledger_report'`);
  let def = fnRes.rows[0].def;
  
  def = def.replace("i.status IN ('POSTED', 'PAID', 'PARTIAL')", "i.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')");
  def = def.replace("b.status IN ('POSTED', 'PAID', 'PARTIAL')", "b.status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')");
    
  def = def.replaceAll(
    "COALESCE(p.data->>'journalEntryId', p.data->>'journal_entry_id', 'JE-CPAY-' || REPLACE(UPPER(p.id), 'PAY-', ''))", 
    "COALESCE(p.data->>'journalEntryId', p.data->>'journal_entry_id', CASE WHEN p.type = 'PAYMENT' THEN 'JE-VPAY-' WHEN p.type = 'REFUND' THEN 'JE-CPAY-' ELSE 'JE-CPAY-' END || REPLACE(UPPER(p.id), 'PAY-', ''))"
  );
  
  def = def.replace("SELECT COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id', '') FROM docs_invoices WHERE company_id = $1",
    "SELECT COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') FROM docs_invoices WHERE company_id = $1 AND status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') AND COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL");
    
  def = def.replace("SELECT COALESCE(data->>'journalEntryId', data->>'journal_entry_id', '') FROM docs_credit_notes WHERE company_id = $1",
    "SELECT COALESCE(data->>'journalEntryId', data->>'journal_entry_id') FROM docs_credit_notes WHERE company_id = $1 AND status IN ('POSTED', 'CLOSED') AND COALESCE(data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL");

  def = def.replace("SELECT COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') FROM docs_bills WHERE company_id = $1 AND COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL",
    "SELECT COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') FROM docs_bills WHERE company_id = $1 AND status IN ('POSTED', 'PAID', 'PARTIAL', 'FULL_REFUNDED', 'PARTIAL_REFUNDED') AND COALESCE(journal_entry_id, data->>'journalEntryId', data->>'journal_entry_id') IS NOT NULL");

  const m1 = "SELECT COALESCE(data->>'journalEntryId', data->>'journal_entry_id', 'JE-CPAY-' || REPLACE(UPPER(id), 'PAY-', '')) FROM docs_payments WHERE company_id = $1";
  const m2 = "SELECT 'JE-VPAY-' || REPLACE(UPPER(id), 'PAY-', '') FROM docs_payments WHERE company_id = $1";
  const m3 = "SELECT 'JE-PAY-' || REPLACE(UPPER(id), 'PAY-', '') FROM docs_payments WHERE company_id = $1";
  const m4 = "SELECT 'JE-' || REPLACE(UPPER(id), 'PAY-', '') FROM docs_payments WHERE company_id = $1";
  
  def = def.replace(m1, "SELECT COALESCE(data->>'journalEntryId', data->>'journal_entry_id', CASE WHEN type = 'PAYMENT' THEN 'JE-VPAY-' WHEN type = 'REFUND' THEN 'JE-CPAY-' ELSE 'JE-CPAY-' END || REPLACE(UPPER(id), 'PAY-', '')) FROM docs_payments WHERE company_id = $1 AND status = 'POSTED'");
  def = def.replace("UNION ALL\n               " + m2, "");
  def = def.replace("UNION ALL\n               " + m3, "");
  def = def.replace("UNION ALL\n               " + m4, "");

  await client.query(def);
  console.log('Function applied!');
  
  const fnRes2 = await client.query(`
    SELECT SUM(cash_impact) FROM get_general_ledger_report('comp-1', '2020-01-01', '2030-01-01')
  `);
  
  console.log('Resulting sum:', fnRes2.rows);
  client.end();
}
main();
