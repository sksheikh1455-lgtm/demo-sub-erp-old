import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  let restored = 0;
  
  // Invoices
  let rInv = await c.query(`
    UPDATE docs_journals j
    SET status = 'POSTED'
    FROM docs_invoices i
    WHERE j.id = 'JE-INV-' || upper(i.id::text)
      AND j.status = 'VOID'
      AND i.status IN ('POSTED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')
  `);
  restored += rInv.rowCount || 0;

  // Bills
  let rBill = await c.query(`
    UPDATE docs_journals j
    SET status = 'POSTED'
    FROM docs_bills b
    WHERE j.id = 'JE-BILL-' || upper(b.id::text)
      AND j.status = 'VOID'
      AND b.status IN ('POSTED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'FULL_REFUNDED', 'PARTIAL_REFUNDED')
  `);
  restored += rBill.rowCount || 0;

  // Payments
  let rPay = await c.query(`
    UPDATE docs_journals j
    SET status = 'POSTED'
    FROM docs_payments p
    WHERE (
            upper(p.id::text) = replace(replace(replace(replace(j.id, 'JE-CUST_PAY-', ''), 'JE-VEND_PAY-', ''), 'JE-CPAY-', ''), 'JE-VPAY-', '')
         OR upper(p.id::text) = replace(replace(j.id, 'JE-CPAY-CREDIT-', 'PAY-CREDIT-'), 'JE-VPAY-CREDIT-', 'PAY-CREDIT-')
         OR j.id = 'JE-CPAY-AUTO-' || upper(p.id::text)
         OR j.id = 'JE-VPAY-AUTO-' || upper(p.id::text)
      )
      AND j.journal_type IN ('CUST_PAY', 'VEND_PAY')
      AND j.status = 'VOID'
      AND p.status = 'POSTED'
  `);
  restored += rPay.rowCount || 0;

  // Credit Notes
  let rCN = await c.query(`
    UPDATE docs_journals j
    SET status = 'POSTED'
    FROM docs_credit_notes cn
    WHERE j.id = 'JE-' || upper(cn.id::text)
      AND j.journal_type = 'CREDIT_NOTE'
      AND j.status = 'VOID'
      AND cn.status = 'POSTED'
  `);
  restored += rCN.rowCount || 0;

  console.log('Restored POSTED status to journals:', restored);

  await c.end();
}
run();
