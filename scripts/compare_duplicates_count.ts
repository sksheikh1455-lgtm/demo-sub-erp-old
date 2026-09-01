import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const globalRes = await client.query(`
      SELECT COUNT(*) as count FROM (
        SELECT LOWER(TRIM(name))
        FROM docs_contacts
        GROUP BY LOWER(TRIM(name))
        HAVING COUNT(*) > 1
      ) as t;
    `);
    console.log("Global duplicate names count:", globalRes.rows[0].count);
    
    const companyRes = await client.query(`
      SELECT COUNT(*) as count FROM (
        SELECT LOWER(TRIM(name)), COALESCE(company_id, 'GLOBAL_NULL')
        FROM docs_contacts
        GROUP BY LOWER(TRIM(name)), COALESCE(company_id, 'GLOBAL_NULL')
        HAVING COUNT(*) > 1
      ) as t;
    `);
    console.log("Per-Company duplicate names count:", companyRes.rows[0].count);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
