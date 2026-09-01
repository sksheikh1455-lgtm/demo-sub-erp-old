
import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();
  const r = await c.query("SELECT data FROM docs_accounts WHERE id = 'comp-1777534383835-1011'");
  console.log(JSON.stringify(r.rows[0].data, null, 2));
  await c.end();
}

run().catch(console.error);
