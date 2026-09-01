import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  console.log('--- Checking Invoice Table & Lines for aa46a0d9-1c9c-4ea9-8dd0-e38e0209a194 ---');
  let qInv = await c.query("SELECT id, invoice_number, total, data FROM docs_invoices WHERE id = 'aa46a0d9-1c9c-4ea9-8dd0-e38e0209a194'");
  console.log('Invoice:', qInv.rows[0]);

  let qInvLines = await c.query("SELECT * FROM docs_invoice_lines WHERE invoice_id = 'aa46a0d9-1c9c-4ea9-8dd0-e38e0209a194'");
  console.log('Invoice Lines length:', qInvLines.rows.length);
  if (qInvLines.rows.length > 0) {
    console.log('Invoice Lines:', qInvLines.rows);
  }

  console.log('--- Checking all custom functions starting with post_ ---');
  let qFuncs = await c.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND routine_name LIKE 'post_%'
  `);
  console.log(qFuncs.rows);

  console.log('--- Checking inventory transactions referencing invoice ---');
  let qTxs = await c.query("SELECT * FROM docs_inventory_transactions WHERE reference_id = 'aa46a0d9-1c9c-4ea9-8dd0-e38e0209a194'");
  console.log('Inv Transactions:', qTxs.rows);

  // Let's see if there are standard journal lines and who created them
  console.log('--- Checking Journal & Lines for JE-AA46A0D9-1C9C-4EA9-8DD0-E38E0209A194 ---');
  let jHeader = await c.query("SELECT * FROM docs_journals WHERE id = 'JE-AA46A0D9-1C9C-4EA9-8DD0-E38E0209A194'");
  console.log('Journal header exist?', jHeader.rows.length > 0, jHeader.rows[0]);
  let jLines = await c.query("SELECT * FROM docs_journal_lines WHERE journal_id = 'JE-AA46A0D9-1C9C-4EA9-8DD0-E38E0209A194'");
  console.log('Journal lines:', jLines.rows);

  await c.end();
}
run().catch(console.error);
