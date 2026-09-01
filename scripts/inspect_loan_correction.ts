import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();

  console.log('1. Checking contact and active loan info...');
  const contactId = 'c0cb513b-54d7-4f1e-9d05-48abfd79cb3a';
  const contactRes = await c.query("SELECT * FROM docs_contacts WHERE id = $1", [contactId]);
  console.log('Contact info:', contactRes.rows[0]);

  const loanRes = await c.query("SELECT * FROM docs_loans WHERE contact_id = $1", [contactId]);
  console.log('Loan info:', loanRes.rows[0]);

  console.log('\n2. Checking allowed values in docs_loans type column (or constraints)...');
  const typeCol = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'docs_loans' AND column_name = 'type'
  `);
  console.log('Type col:', typeCol.rows);

  const checkConstraints = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'public.docs_loans'::regclass;
  `);
  console.log('Constraints:', checkConstraints.rows);

  console.log('\n3. Looking for relevant loan asset/receivable or deposit accounts in docs_accounts...');
  const accounts = await c.query(`
    SELECT id, code, name, type, sub_type 
    FROM docs_accounts 
    WHERE (name ILIKE '%loan%' OR name ILIKE '%receivable%' OR name ILIKE '%deposit%' OR code ILIKE '100%') 
      AND company_id = 'comp-1'
    ORDER BY code ASC
  `);
  console.log('Potential asset accounts:');
  console.table(accounts.rows);

  await c.end();
}
run();
