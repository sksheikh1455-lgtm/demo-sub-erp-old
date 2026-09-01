import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT LOWER(TRIM(name)) as trimmed_name, COUNT(*), array_agg(id) as ids, array_agg(company_id) as company_ids
      FROM docs_contacts
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 20;
    `);
    console.log("Duplicate names count:", res.rows.length);
    console.log("Sample duplicates:");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
