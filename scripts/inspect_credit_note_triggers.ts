import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const funcs = ['sync_document_metadata', 'generate_inventory_movements'];
    for (const name of funcs) {
      console.log(`\n--- Source code of ${name} ---`);
      const res = await client.query(`
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = $1;
      `, [name]);
      if (res.rows.length > 0) {
        console.log(res.rows[0].prosrc);
      } else {
        console.log(`${name} not found.`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
