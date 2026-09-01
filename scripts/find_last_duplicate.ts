import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT LOWER(TRIM(name)) as trimmed_name, company_id, COUNT(*), array_agg(id) as ids
      FROM public.docs_contacts
      GROUP BY LOWER(TRIM(name)), company_id
      HAVING COUNT(*) > 1;
    `);
    console.log("Remaining duplicates:");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
