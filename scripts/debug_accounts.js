import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function checkAccounts() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query("SELECT id, code, name, data->>'type' as type FROM docs_accounts ORDER BY code ASC LIMIT 100");
    console.table(res.rows);
  } finally {
    await client.end();
  }
}

checkAccounts().catch(console.error);
