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
      WHERE proname IN ('post_credit_note', 'post_invoice', 'post_payment');
    `);
    
    for (const r of res.rows) {
      let fn = r.def;
      
      const searchStr = "'JL-' || v_journal_id";
      const replaceStr = "'JL-' || substring(md5(random()::text) from 1 for 6) || '-' || v_journal_id";
      
      if (fn.includes(searchStr)) {
          console.log("Replacing static JL IDs in " + r.proname);
          fn = fn.split(searchStr).join(replaceStr);
          await client.query(fn);
          console.log("Deployed updated unique IDs for " + r.proname);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
