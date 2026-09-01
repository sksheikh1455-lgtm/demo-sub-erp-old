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
      WHERE proname IN ('post_credit_note', 'post_bill', 'post_payment');
    `);
    
    for (const r of res.rows) {
      let fn = r.def;
      
      let modified = false;

      const searchStr = "DO UPDATE SET status = 'DRAFT'";
      const replaceStr = "DO UPDATE SET status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END";
      
      if (fn.includes(searchStr)) {
         fn = fn.replace(searchStr, replaceStr);
         modified = true;
      }
      
      if (modified) {
         console.log(`Deploying fixed Header ON CONFLICT logic for ${r.proname}`);
         await client.query(fn);
      }
    }
    console.log("Header Conflict Updates Done.");
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
