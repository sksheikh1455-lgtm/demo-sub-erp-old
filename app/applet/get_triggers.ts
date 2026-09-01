import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const res = await client.query(`
      SELECT tgname as trigger_name, proname as function_name, prosrc as source_code
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'docs_bills'
    `);
    console.log(`Found ${res.rows.length} triggers on docs_bills`);
    for (const row of res.rows) {
      console.log(`\n================= TRIGGER: ${row.trigger_name} (Func: ${row.function_name}) =================`);
      console.log(row.source_code);
    }
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await client.end();
  }
}
main();
