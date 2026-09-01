import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  // 1. INVOICES
  let r = await c.query("SELECT j.id FROM docs_journals j WHERE j.journal_type='INV' AND j.status='POSTED'");
  let orphans = [];
  for(let row of r.rows){
     let invId = row.id.replace('JE-INV-', '').replace('JE-', '');
     let inv = await c.query("SELECT id, status FROM docs_invoices WHERE id=$1", [invId]);
     if (inv.rows.length === 0 || inv.rows[0].status === 'DELETED' || inv.rows[0].status === 'VOID' || inv.rows[0].status === 'DRAFT') {
         orphans.push(row.id);
     }
  }
  
  // 2. BILLS
  let r2 = await c.query("SELECT j.id FROM docs_journals j WHERE j.journal_type='BILL' AND j.status='POSTED'");
  for(let row of r2.rows){
     let billId = row.id.replace('JE-BILL-', '').replace('JE-', '');
     let b = await c.query("SELECT id, status FROM docs_bills WHERE id=$1", [billId]);
     if (b.rows.length === 0 || b.rows[0].status === 'DELETED' || b.rows[0].status === 'VOID' || b.rows[0].status === 'DRAFT') {
         orphans.push(row.id);
     }
  }
  
  // 3. CREDIT NOTES
  let r3 = await c.query("SELECT j.id FROM docs_journals j WHERE j.journal_type='CREDIT_NOTE' AND j.status='POSTED'");
  for(let row of r3.rows){
     let cnId = row.id.replace('JE-CN-', '').replace('JE-', '');
     let cn = await c.query("SELECT id, status FROM docs_credit_notes WHERE id=$1", [cnId]);
     if (cn.rows.length === 0 || cn.rows[0].status === 'DELETED' || cn.rows[0].status === 'VOID' || cn.rows[0].status === 'DRAFT') {
         orphans.push(row.id);
     }
  }

  console.log('Found', orphans.length, 'orphan journals (INV, BILL, CREDIT_NOTE).');
  
  if (orphans.length > 0) {
      await c.query('BEGIN');
      try {
          let orphansStr = orphans.map(x => "'" + x + "'").join(',');
          await c.query(`UPDATE docs_journals SET status = 'VOID' WHERE id IN (${orphansStr})`);
          await c.query(`UPDATE docs_journal_lines SET credit = 0, debit = 0 WHERE journal_id IN (${orphansStr})`);
          await c.query('COMMIT');
          console.log('Successfully VOIDed and zeroed all orphan INV/BILL/CN journals.');
      } catch (e) {
          await c.query('ROLLBACK');
          console.error(e);
      }
  }
  
  await c.end();
}
run();
