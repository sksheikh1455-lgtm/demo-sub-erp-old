import pg from 'pg';
const { Client } = pg;
async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`SELECT COUNT(*) FROM docs_journal_lines`);
  console.log('Total Lines:', res.rows[0]);
  
  const res2 = await client.query(`SELECT COUNT(*) FROM docs_journal_lines WHERE contact_id IS NOT NULL`);
  console.log('Total with contact_id:', res2.rows[0]);
  await client.end();
}
run();
