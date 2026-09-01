import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT tgname, tgrelid::regclass as table_name, pg_get_triggerdef(oid) as def 
      FROM pg_trigger 
      WHERE tgname ILIKE '%double_entry%' OR tgname ILIKE '%verify_journal%';
    `);
    console.log("Double entry or journal validation triggers:");
    console.table(res.rows);
    
    const res2 = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'verify_double_entry_integrity';
    `);
    console.log("Function prosrc:");
    console.log(res2.rows[0]?.prosrc);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
