import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id FROM docs_credit_notes WHERE status = 'POSTED' LIMIT 1;
    `);
    if (res.rows.length > 0) {
      const cnId = res.rows[0].id;
      console.log('Testing reposting CN ID:', cnId);
      
      const beforeRes = await client.query(`SELECT undefined FROM docs_credit_notes WHERE id = $1`, [cnId]);
      const prevJid = beforeRes.rows[0].journal_entry_id;
      
      // Fetch number of lines before
      const countBefore = await client.query(`SELECT count(*) FROM docs_journal_lines WHERE journal_id = $1`, [prevJid]);
      console.log('Lines before:', countBefore.rows[0].count);
      
      // Run it
      await client.query(`SELECT post_credit_note($1, NULL);`, [cnId]);
      
      // Fetch after
      const countAfter = await client.query(`SELECT count(*) FROM docs_journal_lines WHERE journal_id = $1`, [prevJid]);
      console.log('Lines after repost:', countAfter.rows[0].count);
      
      const zeroed = await client.query(`SELECT count(*) FROM docs_journal_lines WHERE journal_id = $1 AND debit = 0 AND credit = 0`, [prevJid]);
      console.log('Zeroed lines:', zeroed.rows[0].count);

      console.log('Repost Success!');
    } else {
      console.log('No POSTED Credit Notes found.');
    }
  } catch (err) {
    console.error('Repost Error:', err);
  } finally {
    await client.end();
  }
}
main();
