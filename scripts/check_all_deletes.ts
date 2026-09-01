import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT proname, pg_get_functiondef(oid) as def 
      FROM pg_proc 
      WHERE proname LIKE 'post_%';
    `);
    
    for (const r of res.rows) {
      if (r.def.includes('DELETE FROM docs_journal_lines')) {
        console.log('FOUND DELETE IN: ' + r.proname);
      }
    }
    console.log("Check complete.");
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
