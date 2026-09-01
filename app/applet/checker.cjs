const pkg = require('pg');
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function checkTransactions(client) {
  let issues = [];

  const { rows: invs } = await client.query("SELECT id, invoice_number, status, total, journal_entry_id, data->>'journalEntryId' as je_id FROM docs_invoices WHERE (date >= '2026-06-30' OR updated_at >= '2026-06-30') AND status IN ('POSTED', 'PAID')");
  for (const inv of invs) {
    const jeId = inv.journal_entry_id || inv.je_id;
    if (!jeId) { issues.push('Invoice ' + inv.invoice_number + ' missing journal_entry_id'); continue; }
    const { rows: je } = await client.query('SELECT * FROM docs_journals WHERE id = $1', [jeId]);
    if (je.length === 0) { issues.push('Invoice ' + inv.invoice_number + ' JE ' + jeId + ' not found'); continue; }
    const { rows: lines } = await client.query('SELECT SUM(debit) as d, SUM(credit) as c FROM docs_journal_lines WHERE journal_id = $1', [jeId]);
    if (lines.length > 0 && lines[0].d !== lines[0].c) issues.push('Invoice ' + inv.invoice_number + ' JE debits ' + lines[0].d + ' != credits ' + lines[0].c);
  }

  const { rows: bills } = await client.query("SELECT id, bill_number, status, total, journal_entry_id, data->>'journalEntryId' as je_id FROM docs_bills WHERE (date >= '2026-06-30' OR updated_at >= '2026-06-30') AND status IN ('POSTED', 'PAID')");
  for (const bill of bills) {
    const jeId = bill.journal_entry_id || bill.je_id;
    if (!jeId) { issues.push('Bill ' + bill.bill_number + ' missing journal_entry_id'); continue; }
    const { rows: je } = await client.query('SELECT * FROM docs_journals WHERE id = $1', [jeId]);
    if (je.length === 0) { issues.push('Bill ' + bill.bill_number + ' JE ' + jeId + ' not found'); continue; }
    const { rows: lines } = await client.query('SELECT SUM(debit) as d, SUM(credit) as c FROM docs_journal_lines WHERE journal_id = $1', [jeId]);
    if (lines.length > 0 && lines[0].d !== lines[0].c) issues.push('Bill ' + bill.bill_number + ' JE debits ' + lines[0].d + ' != credits ' + lines[0].c);
  }

  const { rows: cns } = await client.query("SELECT id, credit_note_number, status, total, journal_entry_id, data->>'journalEntryId' as je_id FROM docs_credit_notes WHERE (date >= '2026-06-30' OR updated_at >= '2026-06-30') AND status IN ('POSTED', 'PAID', 'CLOSED')");
  for (const cn of cns) {
    const jeId = cn.journal_entry_id || cn.je_id;
    if (!jeId) { issues.push('Credit Note ' + cn.credit_note_number + ' missing journal_entry_id'); continue; }
    const { rows: je } = await client.query('SELECT * FROM docs_journals WHERE id = $1', [jeId]);
    if (je.length === 0) { issues.push('Credit Note ' + cn.credit_note_number + ' JE ' + jeId + ' not found'); continue; }
    const { rows: lines } = await client.query('SELECT SUM(debit) as d, SUM(credit) as c FROM docs_journal_lines WHERE journal_id = $1', [jeId]);
    if (lines.length > 0 && lines[0].d !== lines[0].c) issues.push('Credit Note ' + cn.credit_note_number + ' JE debits ' + lines[0].d + ' != credits ' + lines[0].c);
  }

  // Stock check
  const { rows: ivl } = await client.query("SELECT id, invoice_id, product_id, quantity FROM docs_invoice_lines WHERE updated_at >= '2026-06-30'");
  for (const l of ivl) {
     const { rows: tx } = await client.query("SELECT SUM(quantity) as q FROM docs_stock_transactions WHERE document_id = $1 AND product_id = $2 AND type = 'INVOICE'", [l.invoice_id, l.product_id]);
     if (!tx.length || Number(tx[0].q) !== -Number(l.quantity)) {
        // Only if product tracks inventory
        const { rows: p } = await client.query("SELECT track_inventory FROM docs_products WHERE id = $1", [l.product_id]);
        if (p.length && p[0].track_inventory && Number(tx[0].q) !== -Number(l.quantity)) {
            issues.push('Invoice line ' + l.id + ' for product ' + l.product_id + ' has incorrect stock tx: expected -' + l.quantity + ' got ' + tx[0].q);
        }
     }
  }

  const { rows: bll } = await client.query("SELECT id, bill_id, product_id, quantity FROM docs_bill_lines WHERE updated_at >= '2026-06-30'");
  for (const l of bll) {
     const { rows: tx } = await client.query("SELECT SUM(quantity) as q FROM docs_stock_transactions WHERE document_id = $1 AND product_id = $2 AND type = 'BILL'", [l.bill_id, l.product_id]);
     if (!tx.length || Number(tx[0].q) !== Number(l.quantity)) {
        const { rows: p } = await client.query("SELECT track_inventory FROM docs_products WHERE id = $1", [l.product_id]);
        if (p.length && p[0].track_inventory && Number(tx[0].q) !== Number(l.quantity)) {
            issues.push('Bill line ' + l.id + ' for product ' + l.product_id + ' has incorrect stock tx: expected ' + l.quantity + ' got ' + tx[0].q);
        }
     }
  }

  return issues;
}

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const issues = await checkTransactions(client);
  console.log('Issues found:', issues.length);
  if (issues.length > 0) console.log(issues.join('\n'));
  await client.end();
}
run();
