import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  console.log('--- Searching for contacts matching ELECTRIC% or%SOMITI% or %MALIK% ---');
  const res = await c.query(`
    SELECT id, name, type, is_customer, is_vendor, is_lender, opening_balances, data
    FROM docs_contacts
    WHERE name ILIKE '%MALIK%' OR name ILIKE '%SOMITI%' OR name ILIKE '%SOMITY%'
  `);
  console.table(res.rows);

  console.log('\n--- Searching for any docs_loans matching contact IDs or name ---');
  const res2 = await c.query(`
    SELECT id, contact_id, name, amount, type, status 
    FROM docs_loans
    WHERE contact_id IN (SELECT id FROM docs_contacts WHERE name ILIKE '%MALIK%' OR name ILIKE '%SOMITI%' OR name ILIKE '%SOMITY%')
       OR name ILIKE '%MALIK%' OR name ILIKE '%SOMITI%' OR name ILIKE '%SOMITY%'
  `);
  console.table(res2.rows);

  await c.end();
}
run();
