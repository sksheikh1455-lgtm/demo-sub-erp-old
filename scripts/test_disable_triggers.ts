import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("Checking ALTER TABLE DISABLE TRIGGER ALL capabilities...");
    await client.query("BEGIN;");
    await client.query("ALTER TABLE public.docs_journal_lines DISABLE TRIGGER ALL;");
    await client.query("ALTER TABLE public.docs_journal_lines ENABLE TRIGGER ALL;");
    await client.query("COMMIT;");
    console.log("Capabilities verified. Triggers can be successfully disabled and enabled within a transaction.");
  } catch (err) {
    console.error('Error testing trigger capabilities:', err);
    await client.query("ROLLBACK;").catch(() => {});
  } finally {
    await client.end();
  }
}
main();
