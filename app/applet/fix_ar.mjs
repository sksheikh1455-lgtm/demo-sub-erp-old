import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER USER');

  let r = await c.query(`
    SELECT j.id as journal_id, j.data 
    FROM docs_journals j 
    WHERE j.id IN (
        SELECT journal_id FROM docs_journal_lines WHERE debit = 0 AND credit = 0 AND updated_at > '2026-06-01'
    )
  `);
  
  let restored = 0;
  for (let row of r.rows) {
     let lines = row.data && row.data.lines ? row.data.lines : [];
     for (let line of lines) {
         if (line.debit > 0 || line.credit > 0) {
             let upd = await c.query(
               'UPDATE docs_journal_lines SET debit=$1, credit=$2 WHERE id=$3', 
               [line.debit || 0, line.credit || 0, line.id]
             );
             restored += upd.rowCount;
         }
     }
  }
  
  console.log('Restored valid lines from j.data:', restored);

  await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER USER');
  
  await c.end();
}
run();
