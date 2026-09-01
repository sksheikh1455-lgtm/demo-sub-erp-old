import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const listRes = await client.query(`
    SELECT  p.proname, pg_get_function_arguments(p.oid) as args, t.typname as return_type
    FROM    pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    INNER JOIN pg_type t ON t.oid = p.prorettype
    WHERE   n.nspname = 'public' 
      AND (p.proname LIKE '%trial_balance%' OR p.proname LIKE '%profit_and_loss%' OR p.proname LIKE '%balance_sheet%')
  `);
  console.log(listRes.rows);

  await client.end();
}
run();
