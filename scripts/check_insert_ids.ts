import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'post_credit_note';
    `);
    const lines = res.rows[0].prosrc.split('\n');
    for (const line of lines) {
       if (line.includes('VALUES') && line.includes('JL-')) {
          console.log(line);
       }
    }
  } catch (err) {} finally { await client.end(); }
}
main();
