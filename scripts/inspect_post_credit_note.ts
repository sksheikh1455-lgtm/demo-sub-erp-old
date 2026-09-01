import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'post_credit_note';
    `);
    if (rows.length > 0) {
      console.log('--- DEFINITION OF post_credit_note ---');
      console.log(rows[0].prosrc);
    } else {
      console.log('post_credit_note not found');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
