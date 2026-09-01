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
      WHERE proname = 'post_invoice';
    `);
    const lines = res.rows[0].prosrc.split('\n');
    const updateIndex = lines.findIndex(l => l.includes('UPDATE docs_journal_lines SET'));
    console.log(lines.slice(updateIndex - 1, updateIndex + 2).join('\n'));
  } catch (err) {} finally { await client.end(); }
}
main();
