import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    const res = await c.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'get_cash_ledger'");
    if (res.rows.length > 0) {
      console.log(res.rows[0].def);
    } else {
      console.log('Function not found.');
    }
  } catch(e) {
    console.error(e);
  }
  await c.end();
}
run();
