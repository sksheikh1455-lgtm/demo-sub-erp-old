import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const tables = ['docs_invoices', 'docs_bills', 'docs_payments', 'docs_credit_notes', 'docs_loans'];
    for (const t of tables) {
      const res = await client.query(`
        SELECT tgname, pg_get_triggerdef(oid) as def 
        FROM pg_trigger 
        WHERE tgrelid = $1::regclass;
      `, [t]);
      console.log(`=== Triggers on ${t} ===`);
      for (const r of res.rows) {
        console.log(`Trigger: ${r.tgname}`);
        console.log(`Def: ${r.def}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
