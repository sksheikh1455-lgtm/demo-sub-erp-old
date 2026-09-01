import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const res = await client.query(`
      SELECT COUNT(*) as duplicate_count
      FROM (
        SELECT id,
               ROW_NUMBER() OVER(
                   PARTITION BY journal_id, account_id, debit, credit 
                   ORDER BY updated_at ASC, id ASC
               ) as row_num
        FROM docs_journal_lines
      ) duplicates
      WHERE row_num > 1;
    `);
    
    console.log('Remaining Cartesian Duplicates Count:', res.rows[0].duplicate_count);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
