import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, name, company_id, LENGTH(name) as len, LOWER(TRIM(name)) as trimmed
      FROM public.docs_contacts
      WHERE LOWER(TRIM(name)) = 'enayet hossain';
    `);
    console.log("Details for enayet hossain:");
    console.log(JSON.stringify(res.rows, null, 2));

    // Let's run a manual simulation of our query for this name
    const trimmed = 'enayet hossain';
    const company_id = 'comp-1';

    console.log("\n--- SIMULATION FOR ENAYET HOSSAIN ---");
    const masterRes = await client.query(`
      SELECT id, name
      FROM public.docs_contacts c
      WHERE LOWER(TRIM(c.name)) = $1 
        AND (c.company_id = $2 OR (c.company_id IS NULL AND $2 IS NULL))
      ORDER BY 
        ((SELECT COUNT(*) FROM public.docs_invoices WHERE customer_id = c.id) + 
         (SELECT COUNT(*) FROM public.docs_bills WHERE vendor_id = c.id)) DESC,
        c.updated_at DESC,
        c.id ASC
      LIMIT 1;
    `, [trimmed, company_id]);
    const master_id = masterRes.rows[0]?.id;
    console.log("Master ID would be:", master_id);

    const dupRes = await client.query(`
      SELECT id, name
      FROM public.docs_contacts c
      WHERE LOWER(TRIM(c.name)) = $1 
        AND (c.company_id = $2 OR (c.company_id IS NULL AND $2 IS NULL))
        AND id != $3;
    `, [trimmed, company_id, master_id]);
    console.log("Duplicate IDs found:", dupRes.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}
main();
