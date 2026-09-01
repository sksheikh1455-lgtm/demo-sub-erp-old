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
      WHERE proname IN ('post_credit_note', 'post_invoice', 'post_bill', 'post_payment');
    `);
    
    for (const r of res.rows) {
      let fn = r.def;
      
      const searchStr = "v_run_id TEXT := v_run_id;";
      const replaceStr = "v_run_id TEXT := substring(md5(random()::text) from 1 for 6);";
      
      if (fn.includes(searchStr)) {
          console.log("Fixing circular assignment in " + r.proname);
          fn = fn.replace(searchStr, replaceStr);
          await client.query(fn);
          console.log("Deployed fixed assignment logic for " + r.proname);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
