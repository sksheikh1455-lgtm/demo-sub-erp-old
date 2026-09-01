import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Schema reloaded');
  await client.end();
}
run();
