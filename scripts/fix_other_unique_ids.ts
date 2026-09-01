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
      WHERE proname IN ('post_bill', 'post_inventory_adjustment', 'post_expense');
    `);
    
    for (const r of res.rows) {
      let fn = r.def;
      
      const searchStr = "'JL-' || v_journal_id";
      const replaceStr = "'JL-' || substring(md5(random()::text) from 1 for 6) || '-' || v_journal_id";
      
      if (fn.includes(searchStr)) {
          console.log("Replacing static JL IDs in " + r.proname);
          fn = fn.split(searchStr).join(replaceStr);
      }
      
      const badLine = "DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;";
      if (fn.includes(badLine)) {
          console.log("Replacing DELETE line in " + r.proname);
          const replacement = `
    -- Enforce Append-Only by Reversing Previous Lines if re-running
    INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    SELECT 'REV-' || substring(md5(random()::text) from 1 for 10), journal_id, company_id, account_id, contact_id,
           CASE WHEN sum(debit - credit) < 0 THEN abs(sum(debit - credit)) ELSE 0 END,
           CASE WHEN sum(debit - credit) > 0 THEN sum(debit - credit) ELSE 0 END,
           'Auto Reversal of previous total'
    FROM docs_journal_lines 
    WHERE journal_id = v_journal_id
    GROUP BY journal_id, company_id, account_id, contact_id
    HAVING ABS(sum(debit - credit)) > 0.01;
`;
          fn = fn.replace(badLine, replacement);
      }
      
      if (fn !== r.def) {
          await client.query(fn);
          console.log("Deployed updated logic for " + r.proname);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
