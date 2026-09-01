import pg from 'pg';
const { Client } = pg;
async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`SELECT contact_id, contact_id::text, SUM(debit) as deb, SUM(credit) as cred FROM docs_journal_lines WHERE contact_id IS NOT NULL GROUP BY contact_id`);
  console.log(res.rows.slice(0, 5));
  await client.end();
}
run();
