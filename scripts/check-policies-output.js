import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function checkPolicies() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT * FROM pg_policies WHERE tablename = 'docs_bills'");
    console.log('Policies:', JSON.stringify(rows, null, 2));
  } finally {
    await client.end();
  }
}

checkPolicies();
