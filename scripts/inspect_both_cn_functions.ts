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
    for (const r of res.rows) {
      console.log(`\n============================================================`);
      console.log(`OID: ${r.oid}, Name: ${r.proname}, Args: ${r.args}`);
      console.log(`============================================================`);
      console.log(r.definition);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
