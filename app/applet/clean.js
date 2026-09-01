import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query('BEGIN');
  try {
    const jId = 'JE-CPAY-F77B7A13-D955-461B-A329-BFB692C014D3';
    
    await client.query('SET session_replication_role = replica;');

    await client.query('DELETE FROM docs_journal_lines WHERE journal_id = $1', [jId]);

    await client.query(`
      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description, updated_at, created_at)
      VALUES (
        'JL-fdfc927b-liq', $1, 'comp-1', 'comp-1-100100', null, 18500, 0,
        'Payment: f77b7a13-d955-461b-a329-bfb692c014d3 (RFL ASAD)',
        NOW(), NOW()
      )
    `, [jId]);

    await client.query(`
      INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description, updated_at, created_at)
      VALUES (
        'JL-fdfc927b-part', $1, 'comp-1', 'comp-1-100201', '89a0be66-4981-4a12-a112-5cebbf2bc229', 0, 18500,
        'Reconciliation: f77b7a13-d955-461b-a329-bfb692c014d3 (RFL ASAD)',
        NOW(), NOW()
      )
    `, [jId]);

    await client.query('COMMIT');
    console.log('Successfully cleaned up lines');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
  } finally {
    await client.query('SET session_replication_role = DEFAULT;');
    client.end();
  }
}
main();
