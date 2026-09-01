import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT oid, proname, pg_get_function_arguments(oid) as args, pg_get_functiondef(oid) as definition
      FROM pg_proc 
      WHERE proname = 'post_credit_note';
    `);
    console.log(`Found ${res.rows.length} functions:`);
    for (const r of res.rows) {
      console.log(`OID: ${r.oid}, Name: ${r.proname}, Args: ${r.args}`);
      // Print first 400 chars of definition
      console.log(r.definition.substring(0, 400));
      console.log("=".repeat(60));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
