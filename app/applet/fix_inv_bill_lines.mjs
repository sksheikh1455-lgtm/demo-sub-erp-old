import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  await c.query(`ALTER TABLE docs_journal_lines DISABLE TRIGGER USER`);

  // Target journals that have Zero Amount lines
  let q = `
    SELECT j.id, j.data, j.company_id, j.journal_type
    FROM docs_journals j 
    WHERE j.status = 'POSTED' 
      AND j.data->'lines' IS NOT NULL
      AND j.id IN (SELECT journal_id FROM docs_journal_lines WHERE debit = 0 AND credit = 0)
  `;
  let r = await c.query(q);
  
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  for (let row of r.rows) {
     let lines = row.data && row.data.lines ? row.data.lines : [];
     let hasValidLines = false;
     for (let line of lines) {
         if (parseFloat(line.debit || 0) > 0 || parseFloat(line.credit || 0) > 0) {
             hasValidLines = true;
             let rCheck = await c.query(`SELECT id, debit, credit FROM docs_journal_lines WHERE id = $1`, [line.id]);
             if (rCheck.rows.length === 0) {
                 let acct = line.account_id || line.accountId;
                 let cont = line.contact_id || line.contactId || null;
                 let comp = row.company_id;
                 await c.query(`INSERT INTO docs_journal_lines(id, journal_id, account_id, contact_id, company_id, debit, credit) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [line.id, row.id, acct, cont, comp, parseFloat(line.debit) || 0, parseFloat(line.credit) || 0]);
                 inserted++;
             } else {
                 if (parseFloat(rCheck.rows[0].debit) === 0 && parseFloat(rCheck.rows[0].credit) === 0) {
                     await c.query(`UPDATE docs_journal_lines SET debit = $1, credit = $2 WHERE id = $3`, [parseFloat(line.debit) || 0, parseFloat(line.credit) || 0, line.id]);
                     updated++;
                 }
             }
         }
     }
     if (hasValidLines) {
        let rDel = await c.query(`DELETE FROM docs_journal_lines WHERE journal_id = $1 AND debit = 0 AND credit = 0`, [row.id]);
        deleted += rDel.rowCount;
     }
  }
  console.log(`INV/BILL stats - inserted: ${inserted}, updated: ${updated}, deleted zero ones: ${deleted}`);

  await c.query(`ALTER TABLE docs_journal_lines ENABLE TRIGGER USER`);
  await c.end();
}
run();
