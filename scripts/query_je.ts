import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function test() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`SELECT id, data FROM docs_journals WHERE id = 'JE-44247789-0C1C-45BB-AB58-53FF577F0D24'`);
  console.log(JSON.stringify(res.rows, null, 2));
  
  const res2 = await client.query(`SELECT * FROM docs_journal_lines WHERE journal_id = 'JE-44247789-0C1C-45BB-AB58-53FF577F0D24'`);
  console.log(JSON.stringify(res2.rows, null, 2));
  
  await client.end();
}
test();
