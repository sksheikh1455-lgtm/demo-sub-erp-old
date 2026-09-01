import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- get_partner_summary ---');
  let res = await client.query(`
    SELECT * FROM public.get_partner_summary(ARRAY['comp-1'], 'CUSTOMER', '2026-06-30')
    WHERE contact_name ILIKE '%VAI VAI%';
  `);
  console.table(res.rows);

  console.log('--- get_general_ledger for Customer ---');
  // I don't know the ID of VAI VAI, let's just search first
  let vai = await client.query("SELECT id FROM docs_contacts WHERE name ILIKE '%VAI VAI%'");
  if (vai.rows.length) {
    const cid = vai.rows[0].id;
    let res2 = await client.query(`
      SELECT * FROM public.get_general_ledger(ARRAY['comp-1'], NULL, ARRAY[$1], '2000-01-01', '2027-01-01', 'CUSTOMER')
    `, [cid]);
    console.table(res2.rows);
  }

  await client.end();
}
run().catch(console.error);
