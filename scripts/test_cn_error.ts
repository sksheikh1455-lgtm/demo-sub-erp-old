import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id FROM docs_credit_notes WHERE status = 'DRAFT' LIMIT 1;
    `);
    if (res.rows.length > 0) {
      const cnId = res.rows[0].id;
      console.log('Testing with CN ID:', cnId);
      await client.query(`SELECT post_credit_note($1, NULL);`, [cnId]);
      console.log('Success!');
    } else {
      console.log('No DRAFT Credit Notes found. Looking for any recently unposted or draft...');
      const fallback = await client.query(`SELECT id FROM docs_credit_notes LIMIT 1`);
      if (fallback.rows.length) {
         console.log('Trying fallback:', fallback.rows[0].id);
         await client.query(`SELECT post_credit_note($1, NULL);`, [fallback.rows[0].id]);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
