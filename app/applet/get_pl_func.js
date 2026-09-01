const pg = require('pg');
async function run() {
  const c = new pg.Client(process.env.SUPABASE_DB_URL);
  await c.connect();
  const res = await c.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_profit_and_loss_enterprise'");
  if(res.rows.length > 0) {
    console.log(res.rows[0].pg_get_functiondef);
  } else {
    console.log('Not found');
  }
  await c.end();
}
run();
