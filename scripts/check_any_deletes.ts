import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT proname
      FROM pg_proc 
      WHERE prokind = 'f' AND prosrc ILIKE '%DELETE FROM docs_journal_lines%';
    `);
    
    for (const r of res.rows) {
      console.log('FOUND DELETE IN: ' + r.proname);
    }
    console.log("Check complete.");
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
