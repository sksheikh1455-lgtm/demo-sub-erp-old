import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const loanAccountId = 'acc-emsg-loan-rec';
  
  await client.query(`
    INSERT INTO docs_accounts (id, company_id, name, code, type, sub_type)
    VALUES ($1, 'comp-1', 'Loan Receivable (Vendor: ELECTRIC MALIK SOMITI GOPALGONJ)', '100601', 'ASSET', 'OTHER_CURRENT_ASSET')
    ON CONFLICT (id) DO NOTHING;
  `, [loanAccountId]);

  console.log("Account inserted");
  await client.end();
}
run();
