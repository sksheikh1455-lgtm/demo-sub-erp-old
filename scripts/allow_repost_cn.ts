import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_functiondef(oid) as def 
      FROM pg_proc 
      WHERE proname = 'post_credit_note';
    `);
    
    let fn = res.rows[0].def;
    
    // Remove the block checking if journal already exists.
    const searchStr = `
    IF EXISTS(SELECT 1 FROM docs_journals WHERE id = v_journal_id) THEN 
        RETURN jsonb_build_object('success', true, 'message', 'Already posted', 'journal_id', v_journal_id); 
    END IF;
`;
    if (fn.includes(searchStr)) {
        console.log("Removing Already posted block in post_credit_note");
        // Remove it but be careful of whitespace
        fn = fn.replace(searchStr, "    -- EXISTS CHECK REMOVED FOR REPOSTING\n");
    } else {
        // Fallback replacement if exact text differs slightly
        let regex = /IF EXISTS\(SELECT 1 FROM docs_journals WHERE id = v_journal_id\) THEN\s+RETURN jsonb_build_object\('success', true, 'message', 'Already posted', 'journal_id', v_journal_id\);\s+END IF;/;
        fn = fn.replace(regex, "    -- EXISTS CHECK REMOVED FOR REPOSTING\n");
    }
    
    await client.query(fn);
    console.log("Deployed updated logic for post_credit_note");

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
