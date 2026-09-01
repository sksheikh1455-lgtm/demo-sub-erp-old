import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER USER');

  // Find CUST_PAY and VEND_PAY journals
  let r = await c.query(`
    SELECT j.id as jid, p.amount, p.type, p.account_id, p.partner_account_id, p.id as pid
    FROM docs_journals j
    JOIN docs_payments p ON upper(p.id::text) = replace(replace(replace(replace(j.id, 'JE-CUST_PAY-', ''), 'JE-VEND_PAY-', ''), 'JE-CPAY-', ''), 'JE-VPAY-', '')
       OR j.id = 'JE-CPAY-AUTO-' || upper(p.id::text)
    WHERE j.journal_type IN ('CUST_PAY', 'VEND_PAY')
      AND j.status = 'POSTED'
  `);
  
  let restored = 0;
  for (let row of r.rows) {
     let amount = parseFloat(row.amount);
     if (!amount) continue;

     let lines_res = await c.query(`SELECT id, account_id FROM docs_journal_lines WHERE journal_id = $1`, [row.jid]);
     
     for (let line of lines_res.rows) {
        // Is this liquidity line?
        let is_liq = line.account_id === row.account_id;
        let is_ar_ap = line.account_id === row.partner_account_id;
        
        let debit = 0, credit = 0;
        if (row.type === 'RECEIPT') {
            if (is_liq) debit = amount;
            if (is_ar_ap) credit = amount;
        } else if (row.type === 'PAYMENT') {
            if (is_liq) credit = amount;
            if (is_ar_ap) debit = amount;
        }

        if (debit > 0 || credit > 0) {
           let upd = await c.query('UPDATE docs_journal_lines SET debit=$1, credit=$2 WHERE id=$3 AND debit=0 AND credit=0', [debit, credit, line.id]);
           restored += upd.rowCount;
        }
     }
  }
  
  console.log('Restored valid lines from docs_payments:', restored);

  await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER USER');
  
  await c.end();
}
run();
