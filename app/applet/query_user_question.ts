import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  console.log('============= Q1: Investigating PAYMENT PAY-SUL-000897 =============');
  
  // 1. Find the payment in docs_payments
  const qPayment = await c.query(`
    SELECT id, payment_number, company_id, date, amount, status, type, method, account_id, applied_invoices, data 
    FROM docs_payments 
    WHERE payment_number = 'PAY-SUL-000897' OR id = 'PAY-SUL-000897'
  `);
  
  if (qPayment.rows.length === 0) {
    console.log('Payment PAY-SUL-000897 NOT found in docs_payments.');
    // Let's do a loose check
    const qPaymentLoose = await c.query(`
      SELECT id, payment_number, company_id, status, amount, date 
      FROM docs_payments 
      WHERE payment_number LIKE '%000897%' OR id LIKE '%000897%' OR data::text LIKE '%000897%'
      LIMIT 5
    `);
    console.log('Loose matches for "000897" in docs_payments:', qPaymentLoose.rows);
  } else {
    const pay = qPayment.rows[0];
    console.log('Payment record found:', {
      id: pay.id,
      payment_number: pay.payment_number,
      company_id: pay.company_id,
      date: pay.date,
      amount: pay.amount,
      status: pay.status,
      type: pay.type,
      method: pay.method,
      account_id: pay.account_id,
      applied_invoices: pay.applied_invoices
    });
    
    // Check if there is a journal for it
    const v_journal_id_1 = 'JE-CPAY-' + pay.id.toUpperCase();
    const v_journal_id_2 = 'JE-VPAY-' + pay.id.toUpperCase();
    const v_journal_id_3 = 'JE-' + pay.id.toUpperCase();
    
    const qJournal = await c.query(`
      SELECT id, reference_number, company_id, status, journal_type 
      FROM docs_journals 
      WHERE id IN ($1, $2, $3) 
         OR reference_number = $4
         OR reference_number LIKE $5
    `, [v_journal_id_1, v_journal_id_2, v_journal_id_3, pay.payment_number, `%${pay.payment_number}%`]);
    
    console.log('Journal entries related to this payment:', qJournal.rows);
    
    if (qJournal.rows.length > 0) {
      for (const j of qJournal.rows) {
        const qLines = await c.query(`
          SELECT jl.id, jl.account_id, a.code as acc_code, a.name as acc_name, jl.debit, jl.credit, jl.description 
          FROM docs_journal_lines jl
          JOIN docs_accounts a ON jl.account_id = a.id
          WHERE jl.journal_id = $1
        `, [j.id]);
        console.log(`Journal Lines for journal ID ${j.id}:`, qLines.rows);
      }
    }
  }

  console.log('\n============= Q2: Checking Today\'s Cash Sale Invoices =============');
  // Today is 2026-06-05. Let's find invoices created today with customer matching 'cash sale' or 'cash-sale'
  const qCashSales = await c.query(`
    SELECT i.id, i.invoice_number, i.company_id, i.date, i.total, i.status, i.customer_id,
           c.name as customer_name, i.journal_entry_id
    FROM docs_invoices i
    LEFT JOIN docs_contacts c ON i.customer_id = c.id
    WHERE (i.date = '2026-06-05' OR i.updated_at::date = '2026-06-05')
      AND (
        c.name ILIKE '%cash%sale%' 
        OR c.name ILIKE '%cash-sale%' 
        OR i.customer_id ILIKE '%cash%sale%' 
        OR i.customer_id ILIKE '%cash-sale%'
      )
    ORDER BY i.invoice_number ASC
  `);
  
  console.log(`Found ${qCashSales.rows.length} cash sale invoices today (2026-06-05):`);
  for (const inv of qCashSales.rows) {
    // Check if there is an automatic payment or any associated payments for this invoice
    // Payments are linked either in applied_invoices json array, or in payment.data->'appliedInvoices'
    const qPayments = await c.query(`
      SELECT p.id, p.payment_number, p.amount, p.status, p.date
      FROM docs_payments p
      WHERE (p.data->'appliedInvoices' @> jsonb_build_array(jsonb_build_object('invoiceId', $1))
         OR p.applied_invoices @> jsonb_build_array(jsonb_build_object('invoiceId', $1))
         OR p.data->>'invoiceId' = $1)
    `, [inv.id]);
    
    console.log(`Invoice ${inv.invoice_number} (Total: ${inv.total}, Status: ${inv.status}, DB ID: ${inv.id}):`);
    console.log(`  Linked Payments in SB / DB:`, qPayments.rows);
    
    // Check if the invoice is posted and if it has a journal entry
    if (inv.journal_entry_id) {
      console.log(`  Linked Journal Entry ID: ${inv.journal_entry_id}`);
    } else {
      console.log(`  Warning: NO Linked Journal Entry ID stored on invoice!`);
    }
  }

  await c.end();
}

run().catch(console.error);
