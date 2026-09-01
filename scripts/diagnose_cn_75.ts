import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const cnId = '2e166c1b-66b9-49d3-95f6-5a16af428a3f'; // CN-SUL-000075
    console.log('Querying Credit Note detail...');
    const cnRes = await client.query('SELECT * FROM docs_credit_notes WHERE id = $1', [cnId]);
    console.log('CN Row values:', cnRes.rows[0]);

    const journalId = 'JE-2E166C1B-66B9-49D3-95F6-5A16AF428A3F';
    console.log('\nQuerying Journal Entry detail...');
    const jnlRes = await client.query('SELECT * FROM docs_journals WHERE id = $1', [journalId]);
    if (jnlRes.rows.length > 0) {
      console.log('Journal Row values:', jnlRes.rows[0]);
    } else {
      console.log('Journal Entry not found under', journalId);
    }

    console.log('\nChecking all Journal Entries with reference CN-SUL-000075...');
    const jnlRefRes = await client.query("SELECT id, status, reference_number FROM docs_journals WHERE reference_number = 'CN-SUL-000075'");
    console.table(jnlRefRes.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
