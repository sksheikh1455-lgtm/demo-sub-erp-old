const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, payment_number, journal_entry_id FROM docs_payments 
      WHERE payment_number IN ('PAY-SUL-178996732', 'PAY-SUL-178996731')
         OR id IN ('PAY-SUL-178996732', 'PAY-SUL-178996731')
         OR data->>'number' IN ('PAY-SUL-178996732', 'PAY-SUL-178996731');
    `);
    console.log('Found payments:', res.rows);
    
    for (const p of res.rows) {
      console.log('Deleting payment:', p.id);
      await client.query('DELETE FROM docs_payments WHERE id = $1', [p.id]);
      if (p.journal_entry_id) {
         console.log('Deleting journal:', p.journal_entry_id);
         await client.query('DELETE FROM docs_journals WHERE id = $1', [p.journal_entry_id]);
      }
    }
  } catch (e) {
    console.error('Error applying SQL:', e);
  } finally {
    await client.end();
  }
}
run();
