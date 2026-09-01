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
      await client.query(`SELECT post_credit_note($1, NULL);`, [cnId]);
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
