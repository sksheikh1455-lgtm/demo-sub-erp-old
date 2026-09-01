import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT proname, prosrc 
      FROM pg_proc 
      WHERE proname IN ('post_credit_note', 'post_invoice', 'post_bill', 'post_payment');
    `);
    
    for (const r of res.rows) {
      const lines = r.prosrc.split('\n');
      console.log(r.proname);
      for (const line of lines) {
        if (line.includes('UPDATE docs_journal_lines SET')) {
            console.log("  " + line.trim());
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
