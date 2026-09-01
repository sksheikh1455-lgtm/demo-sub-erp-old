import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const funcs = ['post_invoice', 'post_bill', 'generate_inventory_movements'];
  for (const f of funcs) {
    const res = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = $1
    `, [f]);
    if (res.rows.length > 0) {
      console.log(`=========================================`);
      console.log(`Definition of ${f}:`);
      console.log(`=========================================`);
      console.log(res.rows[0].prosrc);
    } else {
      console.log(`${f} not found!`);
    }
  }

  await client.end();
}
run();
