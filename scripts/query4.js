import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`
    SELECT *
    FROM get_profit_and_loss_enterprise(NULL, '2021-01-01', '2028-01-01');
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run();
