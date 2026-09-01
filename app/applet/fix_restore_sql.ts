import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  await c.query('BEGIN');
  try {
      await c.query('ALTER TABLE docs_journals DISABLE TRIGGER USER');
      await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER USER');

      // Restore INV
      await c.query(`
      UPDATE docs_journals
      SET status = 'POSTED'
      FROM docs_invoices
      WHERE docs_journals.journal_type = 'INV' 
        AND docs_journals.status = 'VOID'
        AND LOWER(docs_journals.id) IN (LOWER('JE-' || docs_invoices.id), LOWER('JE-INV-' || docs_invoices.id))
        AND docs_invoices.status = 'POSTED'
      `);
      
      // Restore BILL
      await c.query(`
      UPDATE docs_journals
      SET status = 'POSTED'
      FROM docs_bills
      WHERE docs_journals.journal_type = 'BILL' 
        AND docs_journals.status = 'VOID'
        AND LOWER(docs_journals.id) IN (LOWER('JE-' || docs_bills.id), LOWER('JE-BILL-' || docs_bills.id))
        AND docs_bills.status = 'POSTED'
      `);

      // Restore CREDIT_NOTE
      await c.query(`
      UPDATE docs_journals
      SET status = 'POSTED'
      FROM docs_credit_notes
      WHERE docs_journals.journal_type = 'CREDIT_NOTE' 
        AND docs_journals.status = 'VOID'
        AND LOWER(docs_journals.id) IN (LOWER('JE-' || docs_credit_notes.id), LOWER('JE-CN-' || docs_credit_notes.id))
        AND docs_credit_notes.status = 'POSTED'
      `);

      // Restore CPAY AUTO
      await c.query(`
      UPDATE docs_journals
      SET status = 'POSTED'
      FROM docs_invoices
      WHERE docs_journals.journal_type = 'CUST_PAY' 
        AND docs_journals.id LIKE 'JE-CPAY-AUTO-%'
        AND docs_journals.status = 'VOID'
        AND LOWER(docs_journals.id) = LOWER('JE-CPAY-AUTO-' || docs_invoices.id)
        AND docs_invoices.status = 'POSTED'
      `);

      // Now restore data.lines into docs_journal_lines
      // For all journals that are now POSTED and updated_at > recent?
      // Actually just all POSTED journals where their lines have credit=0 and debit=0 (which means they were zeroed by me)
      let r = await c.query(`
          SELECT j.id, j.data 
          FROM docs_journals j 
          JOIN docs_journal_lines l ON l.journal_id = j.id
          WHERE j.status = 'POSTED' 
            AND l.debit = 0 AND l.credit = 0 
            AND l.updated_at > NOW() - INTERVAL '10 hours'
          GROUP BY j.id, j.data
      `);

      for (let m of r.rows) {
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
      console.log('Restored all mistakenly zeroed journals successfully in SQL pass!');
  } catch(e) {
      await c.query('ROLLBACK');
      console.error(e);
  }
  await c.end();
}
run();
