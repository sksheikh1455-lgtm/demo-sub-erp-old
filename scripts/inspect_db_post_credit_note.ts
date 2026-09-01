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
      WHERE proname = 'post_credit_note';
    `);
    if (res.rows.length > 0) {
      const src = res.rows[0].prosrc;
      const lines = src.split('\n');
      console.log("=== THE LOADED DB CODE ===");
      for (let i = 120; i <= 175 && i <= lines.length; i++) {
        console.log(`${i}: ${lines[i-1]}`);
      }
    } else {
      console.log("Not found!");
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
