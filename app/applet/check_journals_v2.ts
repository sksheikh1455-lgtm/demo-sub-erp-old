import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const { rows } = await client.query(`SELECT * FROM docs_journals WHERE data::text LIKE '%INV-SUL-004544%' OR data::text LIKE '%PAY-SUL-004001%' OR reference LIKE '%INV-SUL-004544%' OR reference LIKE '%PAY-SUL-004001%' OR data::text LIKE '%7f4e4eb7-cfbc-479d-b806-62eeea15d6f2%'`);
  
  for (const r of rows) {
    const { rows: lines } = await client.query('SELECT debit, credit, account_id FROM docs_journal_lines WHERE journal_id = $1', [r.id]);
    console.log('Journal', r.id, r.journal_type, lines);
  }
  await client.end();
}
run();
