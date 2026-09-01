import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();
  let r = await c.query("SELECT p.proname, pg_get_functiondef(p.oid) as def FROM pg_proc p WHERE p.proname IN ('post_bill', 'generate_inventory_movements', 'trg_bill_inventory', 'post_vendor_bill')");
  console.log('rpc result:');
  r.rows.forEach(row => { console.log(row.proname); console.log(row.def); });
  await c.end();
}
run();
