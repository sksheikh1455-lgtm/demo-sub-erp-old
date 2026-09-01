import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, company_id, date, status, reference_number, journal_type
      FROM docs_journals
      WHERE journal_type = 'CREDIT_NOTE' OR reference_number LIKE 'CN%'
      ORDER BY date DESC;
    `);
    console.log(`Found ${res.rows.length} Credit Note journals:`);
    console.table(res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
