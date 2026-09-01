import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT LOWER(TRIM(name)) as trimmed_name, COALESCE(company_id, 'GLOBAL_NULL') as comp_id, COUNT(*)
      FROM docs_contacts
      GROUP BY LOWER(TRIM(name)), COALESCE(company_id, 'GLOBAL_NULL')
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC;
    `);
    console.log("Duplicate count grouping by name + company:", res.rows.length);
    console.log(JSON.stringify(res.rows.slice(0, 15), null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
