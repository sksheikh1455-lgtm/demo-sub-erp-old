import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  let res = await client.query('SELECT * FROM docs_loans');
  console.log("docs_loans length:", res.rows.length);
  if (res.rows.length > 0) {
    console.log("First docs_loans:", res.rows[0]);
  }

  res = await client.query('SELECT * FROM loans');
  console.log("loans length:", res.rows.length);
  if (res.rows.length > 0) {
    console.log("First loans:", res.rows[0]);
  }

  await client.end();
}
run();
