import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("=== block_update_posted_journal source ===");
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'block_update_posted_journal'
    `);
    if (res.rows.length > 0) {
      console.log(res.rows[0].prosrc);
    } else {
      console.log('block_update_posted_journal not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
