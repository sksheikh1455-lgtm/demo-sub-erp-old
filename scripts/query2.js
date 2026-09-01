import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname = 'get_profit_and_loss_enterprise';
  `);
  console.log(res.rows[0].def);
  await client.end();
}
run();
