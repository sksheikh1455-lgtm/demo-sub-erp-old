import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  let contactId = 'contact-cash-sale-global';
  let ledger = await c.query("SELECT j.id, l.id as line_id, j.status, j.journal_type, l.debit, l.credit, j.company_id, j.date FROM docs_journal_lines l JOIN docs_journals j ON l.journal_id = j.id WHERE l.contact_id = $1 AND j.status = 'POSTED'", [contactId]);
  
  let debit = 0, credit = 0;
  for (let r of ledger.rows) {
     debit += Number(r.debit || 0);
     credit += Number(r.credit || 0);
  }
  console.log('Balance:', debit - credit, 'D:', debit, 'Cr:', credit);
  
  // What are the individual entries that make up the balance? 
  // Normally: Invoices debit AR. Payments credit AR.
  // If Auto-cash sale rules are correctly applying, they should be in tandem. 
  let invIds = ledger.rows.filter(r => r.journal_type === 'INV').map(r => r.id.replace('JE-', ''));
  console.log('Invoices using this contact:', invIds.length);
  
  let db_invoices = await c.query("SELECT id, invoice_number, status, total FROM docs_invoices WHERE customer_id = $1 AND status != 'DELETED' AND status != 'DRAFT'", [contactId]);
  let expectedTotal = 0;
  for (let i of db_invoices.rows) expectedTotal += Number(i.total);
  console.log('Total sales for contact (from invoices table):', expectedTotal);
  
  await c.end();
}
run();
