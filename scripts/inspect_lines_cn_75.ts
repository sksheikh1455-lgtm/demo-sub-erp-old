import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const journalId = 'JE-2E166C1B-66B9-49D3-95F6-5A16AF428A3F';
    console.log(`Querying Journal Lines for ${journalId}...`);
    const res = await client.query('SELECT id, account_id, debit, credit, description FROM docs_journal_lines WHERE journal_id = $1', [journalId]);
    console.table(res.rows);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
