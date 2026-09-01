import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  let r = await c.query("SELECT j.id, l.credit, l.contact_id FROM docs_journals j JOIN docs_journal_lines l ON l.journal_id = j.id WHERE j.journal_type='CUST_PAY' AND j.status='POSTED' AND l.credit > 0 AND j.id LIKE 'JE-CPAY-AUTO-%'");
  
  let orphans = [];
  for(let row of r.rows) {
     let invId = row.id.replace('JE-CPAY-AUTO-', '');
     let inv = await c.query("SELECT id, status FROM docs_invoices WHERE id=$1", [invId]);
     if (inv.rows.length === 0 || inv.rows[0].status === 'DELETED' || inv.rows[0].status === 'VOID' || inv.rows[0].status === 'DRAFT') {
         orphans.push(row.id);
     }
  }
  console.log('Found', orphans.length, 'orphan CPAY auto journals.');
  
  if (orphans.length > 0) {
      await c.query('BEGIN');
      try {
          let orphansStr = orphans.map(x => "'" + x + "'").join(',');
          await c.query(`UPDATE docs_journals SET status = 'VOID' WHERE id IN (${orphansStr})`);
          await c.query(`UPDATE docs_journal_lines SET credit = 0, debit = 0 WHERE journal_id IN (${orphansStr})`);
          await c.query('COMMIT');
          console.log('Successfully VOIDed and zeroed all orphan CPAY journals.');
      } catch (e) {
          await c.query('ROLLBACK');
          console.error(e);
      }
  }
  
  await c.end();
}
run();
