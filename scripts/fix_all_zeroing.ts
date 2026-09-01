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
      
      let modified = false;

      // regex to match: INSERT INTO docs_journal_lines ... SELECT 'REV-' ... FROM docs_journal_lines WHERE journal_id = something GROUP BY ... HAVING ...;
      // AND ALSO it might have journal_id IN (...)
      // We will loop and replace using Regex that captures the identity
      
      let regex = /INSERT INTO docs_journal_lines[^;]+SELECT 'REV-'[^;]+WHERE\s+(journal_id\s*(?:=|IN)\s*[^;]+?)\s+GROUP BY[^;]+;/gi;
      
      fn = fn.replace(regex, (match, journalCondition) => {
         modified = true;
         console.log(`Matched REV insert in ${r.proname}: ${journalCondition}`);
         return `UPDATE docs_journal_lines SET debit = 0, credit = 0 WHERE ${journalCondition.trim()};`;
      });
      
      if (modified) {
         console.log(`Deploying fixed Zeroing logic for ${r.proname}`);
         await client.query(fn);
      }
    }
    console.log("Cleanup done.");
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
