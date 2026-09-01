import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("Checking specific trigger override capabilities...");
    await client.query("BEGIN;");
    await client.query("ALTER TABLE public.docs_journal_lines DISABLE TRIGGER trg_strict_double_entry_check;");
    await client.query("ALTER TABLE public.docs_journal_lines ENABLE TRIGGER trg_strict_double_entry_check;");
    await client.query("COMMIT;");
    console.log("Capabilities verified successfully! We can target specific user-defined triggers.");
  } catch (err) {
    console.error('Error with specific trigger override:', err);
    await client.query("ROLLBACK;").catch(() => {});
  } finally {
    await client.end();
  }
}
main();
