import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const ids = ['JE-CPAY-1778763410148', 'JE-CPAY-1778766018849', 'JE-CPAY-1778777016645'];
    console.log('--- Checking docs_journals for refund payments ---');
    for (const jId of ids) {
      const { rows: journals } = await client.query('SELECT * FROM docs_journals WHERE id = $1;', [jId]);
      if (journals.length === 0) {
        console.log(`Journal JId ${jId} NOT found.`);
      } else {
        const j = journals[0];
        console.log(`Journal found: ID: ${j.id} | company_id: ${j.company_id} | status: ${j.status} | amt: ${j.amount}`);
        const { rows: lines } = await client.query('SELECT * FROM docs_journal_lines WHERE journal_id = $1;', [jId]);
        for (const ln of lines) {
          console.log(`  Line: ID: ${ln.id} | account_id: ${ln.account_id} | Dr: ${ln.debit} | Cr: ${ln.credit}`);
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
