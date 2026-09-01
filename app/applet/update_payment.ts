import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query('BEGIN');
  try {
    const pId = 'f77b7a13-d955-461b-a329-bfb692c014d3';
    
    await client.query(`
      UPDATE docs_payments 
      SET account_id = 'comp-1-100100',
          data = jsonb_set(
            jsonb_set(
              data, 
              '{accountId}', 
              '"comp-1-100100"'
            ),
            '{account_id}',
            '"comp-1-100100"'
          )
      WHERE id = $1
    `, [pId]);

    await client.query(`
      UPDATE docs_journal_lines
      SET account_id = 'comp-1-100100'
      WHERE journal_id = 'JE-CPAY-' || UPPER($1)
      AND account_id = 'comp-1-100101'
    `, [pId]);

    await client.query(`NOTIFY pgrst, 'reload schema'`);

    await client.query('COMMIT');
    console.log('Successfully updated to cash(100100)');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
  }
  client.end();
}
main();
