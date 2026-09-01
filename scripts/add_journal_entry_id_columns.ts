import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  try {
    console.log("Adding journal_entry_id to docs_invoices...");
    await c.query(`
      ALTER TABLE docs_invoices 
      ADD COLUMN IF NOT EXISTS journal_entry_id TEXT;
    `);
    console.log("Added journal_entry_id to docs_invoices successfully!");
  } catch (err: any) {
    console.error("Failed to add to docs_invoices:", err.message);
  }

  try {
    console.log("Adding journal_entry_id to docs_bills...");
    await c.query(`
      ALTER TABLE docs_bills 
      ADD COLUMN IF NOT EXISTS journal_entry_id TEXT;
    `);
    console.log("Added journal_entry_id to docs_bills successfully!");
  } catch (err: any) {
    console.error("Failed to add to docs_bills:", err.message);
  }

  await c.end();
}

run();
