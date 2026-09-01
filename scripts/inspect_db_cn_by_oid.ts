import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_functiondef(16559) as def;
    `);
    if (res.rows.length > 0) {
      console.log(res.rows[0].def);
    } else {
      console.log("OID 16559 not found!");
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
