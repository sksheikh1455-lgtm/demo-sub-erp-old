import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'post_payment';
    `);
    console.log(res.rows[0].prosrc);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

main();
