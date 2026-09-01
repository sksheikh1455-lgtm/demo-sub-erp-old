import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  let mistake = [];

  let r = await c.query("SELECT j.id, j.data FROM docs_journals j WHERE j.journal_type='INV' AND j.status='VOID'");
  for(let row of r.rows){
      let invId = String(row.id).replace('JE-INV-', '').replace('JE-', '').toLowerCase();
      let inv = await c.query("SELECT id, status FROM docs_invoices WHERE id::text = $1", [invId]);
      if (inv.rows.length > 0 && inv.rows[0].status === 'POSTED') {
          mistake.push(row);
      }
  }
  
  let r2 = await c.query("SELECT j.id, j.data FROM docs_journals j WHERE j.journal_type='BILL' AND j.status='VOID'");
  for(let row of r2.rows){
      let billId = String(row.id).replace('JE-BILL-', '').replace('JE-', '').toLowerCase();
      let dbItem = await c.query("SELECT id, status FROM docs_bills WHERE id::text = $1", [billId]);
      if (dbItem.rows.length > 0 && dbItem.rows[0].status === 'POSTED') {
          mistake.push(row);
      }
  }

  let r3 = await c.query("SELECT j.id, j.data FROM docs_journals j WHERE j.journal_type='CREDIT_NOTE' AND j.status='VOID'");
  for(let row of r3.rows){
      let dbId = String(row.id).replace('JE-CN-', '').replace('JE-', '').toLowerCase();
      let dbItem = await c.query("SELECT id, status FROM docs_credit_notes WHERE id::text = $1", [dbId]);
      if (dbItem.rows.length > 0 && dbItem.rows[0].status === 'POSTED') {
          mistake.push(row);
      }
  }

  console.log('Found mistakenly voided journals:', mistake.length);
  
  if (mistake.length > 0) {
      await c.query('BEGIN');
      try {
          await c.query('ALTER TABLE docs_journals DISABLE TRIGGER USER');
          await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER USER');

          for (let m of mistake) {
             await c.query("UPDATE docs_journals SET status='POSTED' WHERE id=$1", [m.id]);
             let lines = m.data && m.data.lines ? m.data.lines : [];
             if (lines.length > 0) {
                 for (let line of lines) {
                     await c.query("UPDATE docs_journal_lines SET debit=$1, credit=$2, contact_id=$3 WHERE id=$4", 
                        [line.debit || 0, line.credit || 0, line.contactId || line.contact_id || null, line.id]);
                 }
             }
          }
          await c.query('ALTER TABLE docs_journals ENABLE TRIGGER USER');
          await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER USER');
          await c.query('COMMIT');
          console.log('Restored!');
      } catch (e) {
          await c.query('ROLLBACK');
          console.error(e);
      }
  }

  await c.end();
}
run();
