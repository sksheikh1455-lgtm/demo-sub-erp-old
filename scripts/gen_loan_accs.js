import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const { rows: loans } = await client.query("SELECT * FROM docs_loans");
  for (const loan of loans) {
    const isReceived = loan.type === 'RECEIVED';
    // 'Loan Payable (ContactName)' OR 'Loan Receivable (ContactName)'
    // BUT we need the exact name convention used, or just link them up.
    // Wait, the UI logic in `postLoan`:
    // const loanAccountCode = isReceived ? '2101' : '100601';
    
    // We can just rely on the loan's name.
    const typeLabel = isReceived ? 'Payable' : 'Receivable';
    const accType = isReceived ? 'LIABILITY' : 'ASSET';
    const subtype = isReceived ? 'OTHER_CURRENT_LIABILITY' : 'OTHER_CURRENT_ASSET';
    const accCode = isReceived ? '2101' : '100601';

    // The payment dropdown for loans filters by name ILIKE '%loan%'.
    // Or actually we can just insert unique accounts for each loan.
    // I will append the loan ID to the ID so its unique.
    
    let { rows: contact } = await client.query("SELECT name, type FROM docs_contacts WHERE id = $1", [loan.contact_id]);
    let cName = contact.length > 0 ? contact[0].name : 'Unknown';
    let cType = contact.length > 0 ? (contact[0].type === 'CUSTOMER' ? 'Customer' : 'Vendor') : 'General';
    
    let accName = `Loan ${typeLabel} (${cType}: ${cName})`;
    
    let { rows: existing } = await client.query("SELECT id FROM docs_accounts WHERE name = $1 AND company_id = $2", [accName, loan.company_id]);
    if (existing.length === 0) {
      await client.query(`
        INSERT INTO docs_accounts (id, company_id, name, code, type, sub_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [
         'acc-loan-' + loan.id,
         loan.company_id,
         accName,
         accCode,
         accType,
         subtype
      ]);
      console.log("Inserted account for loan:", loan.name);
    } else {
      console.log("Skipping, account exists for:", loan.name);
    }
    
    // Wait! Actually `postLoan` expects the account ID to be stored in the loan?
    // Let's check docs_loans, does it have journal_entry_id? It does. Does it have account_id? No, but Journal Lines have it!
    
  }

  await client.end();
}
run();
