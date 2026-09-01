const pg = require('pg');
async function run() {
  const c = new pg.Client(process.env.SUPABASE_DB_URL);
  await c.connect();
  
  try {
    await c.query('ALTER TABLE docs_journals DISABLE TRIGGER ALL');
    await c.query('ALTER TABLE docs_journal_lines DISABLE TRIGGER ALL');
    
    // Update the journal line to use Cost of Goods Sold account
    await c.query("UPDATE docs_journal_lines SET account_id = 'comp-1-500101' WHERE id = 'ac8afa62-8fa5-4526-8e2f-283c488ba99c'");
    console.log('Line updated to COGS (500101)');
    
    // Delete the obsolete profit adjustment account that is now unused
    await c.query("DELETE FROM docs_accounts WHERE id = '3815ad7a-6b4d-4e88-91a1-393103dbf58b'");
    console.log('Deleted obsolete account 3815ad7a-6b4d-4e88-91a1-393103dbf58b');
    
  } catch(e) {
    console.error(e);
  } finally {
    await c.query('ALTER TABLE docs_journals ENABLE TRIGGER ALL');
    await c.query('ALTER TABLE docs_journal_lines ENABLE TRIGGER ALL');
    await c.end();
  }
}
run();
