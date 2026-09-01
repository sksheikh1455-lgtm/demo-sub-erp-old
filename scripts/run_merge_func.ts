import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("Executing public.merge_duplicate_contacts()...");
    const res = await client.query(`SELECT public.merge_duplicate_contacts() as stats;`);
    const stats = res.rows[0].stats;
    console.log("\n--- CONSOLIDATION RESULTS ---");
    console.log(JSON.stringify(stats, null, 2));

    // Let us verify if there are any remaining duplicates
    const checkRes = await client.query(`
      SELECT COUNT(*) as count FROM (
        SELECT LOWER(TRIM(name)), company_id
        FROM public.docs_contacts
        GROUP BY LOWER(TRIM(name)), company_id
        HAVING COUNT(*) > 1
      ) as t;
    `);
    console.log(`\nRemaining duplicate contacts grouped by name+company: ${checkRes.rows[0].count}`);

    const globalCheckRes = await client.query(`
      SELECT COUNT(*) as count FROM (
        SELECT LOWER(TRIM(name))
        FROM public.docs_contacts
        GROUP BY LOWER(TRIM(name))
        HAVING COUNT(*) > 1
      ) as t;
    `);
    console.log(`Remaining duplicate contacts grouped globally: ${globalCheckRes.rows[0].count}`);

  } catch (err) {
    console.error('Error executing merge function:', err);
  } finally {
    await client.end();
  }
}
main();
