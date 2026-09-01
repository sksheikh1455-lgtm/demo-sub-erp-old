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
      WHERE proname IN ('post_expense', 'post_inventory_adjustment');
    `);
    
    for (const r of res.rows) {
      let fn = r.def;
      let modified = false;

      let regex = /INSERT INTO docs_journal_lines[^;]+SELECT 'REV-'[^;]+WHERE\s+(journal_id\s*(?:=|IN)\s*[^;]+?)\s+GROUP BY[^;]+;/gi;
      
      fn = fn.replace(regex, (match, journalCondition) => {
         modified = true;
         console.log(`Matched REV insert in ${r.proname}: ${journalCondition}`);
         return `UPDATE docs_journal_lines SET debit = 0, credit = 0 WHERE ${journalCondition.trim()};`;
      });
      
      const searchStr = "DO UPDATE SET status = 'DRAFT'";
      const replaceStr = "DO UPDATE SET status = CASE WHEN docs_journals.status = 'POSTED' THEN 'POSTED' ELSE 'DRAFT' END";
      if (fn.includes(searchStr)) {
         fn = fn.replace(searchStr, replaceStr);
         modified = true;
      }
      
      // Also might have static DELETE?
      if (fn.includes('DELETE FROM docs_journal_lines WHERE journal_id')) {
         fn = fn.replace(/DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;/g, 
           "UPDATE docs_journal_lines SET debit = 0, credit = 0 WHERE journal_id = v_journal_id;");
         modified = true;
      }

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
