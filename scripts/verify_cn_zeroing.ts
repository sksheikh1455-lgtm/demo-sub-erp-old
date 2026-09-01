import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
     const jid = 'JE-CEEF91D8-277F-4AE4-8B73-E90FF035CD11';
     const c1 = await client.query('SELECT count(*) as count FROM docs_journal_lines WHERE journal_id = $1', [jid]);
     console.log('Total Lines:', c1.rows[0].count);
     
     const c2 = await client.query('SELECT count(*) as count FROM docs_journal_lines WHERE journal_id = $1 AND debit = 0 AND credit = 0', [jid]);
     console.log('Zeroed Lines:', c2.rows[0].count);
     
     const c3 = await client.query('SELECT count(*) as count FROM docs_journal_lines WHERE journal_id = $1 AND (debit != 0 OR credit != 0)', [jid]);
     console.log('Active (Distinct) Lines:', c3.rows[0].count);
     
     const c4 = await client.query('SELECT sum(debit) as deb, sum(credit) as cre FROM docs_journal_lines WHERE journal_id = $1 AND (debit != 0 OR credit != 0)', [jid]);
     console.log('Total Debits:', c4.rows[0].deb, 'Total Credits:', c4.rows[0].cre);
  } catch(e) { console.error(e) }
  client.end();
}
main();
