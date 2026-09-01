import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function checkFunction() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT prosrc FROM pg_proc WHERE proname LIKE '%bill%number%'");
    rows.forEach(r => console.log('Function Src:\n', r.prosrc));
  } finally {
    await client.end();
  }
}

checkFunction();
