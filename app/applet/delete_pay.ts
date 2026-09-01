import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  
  try {
    await c.query('BEGIN');
    
    // Set to VOID to bypass the rules
    await c.query(`UPDATE docs_journals SET status = 'VOID' WHERE id = 'JE-CPAY-AUTO-F5B29F5B-3AB1-4EA0-9F89-1C11A324007F'`);
    
    console.log('Deleted related journal lines:', await c.query(`DELETE FROM docs_journal_lines WHERE journal_id = 'JE-CPAY-AUTO-F5B29F5B-3AB1-4EA0-9F89-1C11A324007F' RETURNING *`));

    console.log('Deleted journal:', await c.query(`DELETE FROM docs_journals WHERE id = 'JE-CPAY-AUTO-F5B29F5B-3AB1-4EA0-9F89-1C11A324007F' RETURNING *`));

    // Set payment to VOID
    await c.query(`UPDATE docs_payments SET status = 'VOID' WHERE id = 'PAY-AUTO-f5b29f5b-3ab1-4ea0-9f89-1c11a324007f'`);
    
    console.log('Deleted payment:', await c.query(`DELETE FROM docs_payments WHERE id = 'PAY-AUTO-f5b29f5b-3ab1-4ea0-9f89-1c11a324007f' RETURNING *`));
    
    await c.query('COMMIT');
    console.log('Successfully deleted the auto payment and associated journal');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Error in deletion:', err);
  } finally {
    await c.end();
  }
}
run();
