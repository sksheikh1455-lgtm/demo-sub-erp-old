import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER USER');

  let qr = `
    SELECT j.id, j.data FROM docs_journals j WHERE j.journal_type = 'CREDIT_NOTE' AND j.status = 'POSTED'
  `;
  let r = await c.query(qr);
  
  let inserted = 0;
  let deleted = 0;
  for (let row of r.rows) {
     let lines = row.data && row.data.lines ? row.data.lines : [];
     let hasValidLines = false;
     for (let line of lines) {
         if (parseFloat(line.debit || 0) > 0 || parseFloat(line.credit || 0) > 0) {
             hasValidLines = true;
             let rCheck = await c.query('SELECT id FROM docs_journal_lines WHERE id = $1', [line.id]);
             if (rCheck.rows.length === 0) {
                 let acct = line.account_id || line.accountId;
                 let cont = line.contact_id || line.contactId || null;
                 await c.query('INSERT INTO docs_journal_lines(id, journal_id, account_id, contact_id, debit, credit) VALUES ($1, $2, $3, $4, $5, $6)', [line.id, row.id, acct, cont, parseFloat(line.debit) || 0, parseFloat(line.credit) || 0]);
                 inserted++;
             }
         }
     }
     if (hasValidLines) {
        let rDel = await c.query('DELETE FROM docs_journal_lines WHERE journal_id = $1 AND debit = 0 AND credit = 0', [row.id]);
        deleted += rDel.rowCount;
     }
  }
  console.log('CREDIT_NOTE stats - inserted:', inserted, 'deleted zero ones:', deleted);

  await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER USER');
  await c.end();
}
run();
