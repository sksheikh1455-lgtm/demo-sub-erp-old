import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- DETAILED JOURNAL LINES ANALYSIS ---');

  // Find all distinct account_ids in journal_lines
  const distinctRes = await client.query(`
    SELECT DISTINCT account_id, a.code, a.name, a.company_id, COUNT(*) as occurs
    FROM docs_journal_lines jl
    LEFT JOIN docs_accounts a ON a.id = jl.account_id
    GROUP BY account_id, a.code, a.name, a.company_id
  `);
  console.log('Distinct Accounts in Journal Lines:');
  distinctRes.rows.forEach(r => {
    console.log(`  Account ID: ${r.account_id} | Code: ${r.code} | Name: ${r.name} | Co: ${r.company_id} | Lines: ${r.occurs}`);
  });

  // Check journals where account_id is 'acc-inventory-asset' or something starting with 'acc-' or if any error/fallback account is present.
  const badRes = await client.query(`
    SELECT jl.id, jl.journal_id, jl.account_id, jl.debit, jl.credit, jl.company_id, j.status
    FROM docs_journal_lines jl
    JOIN docs_journals j ON j.id = jl.journal_id
    WHERE jl.account_id NOT IN (SELECT id FROM docs_accounts)
  `);
  console.log(`\nJournal lines referencing NON-EXISTENT accounts: ${badRes.rows.length}`);
  badRes.rows.slice(0, 10).forEach(r => {
    console.log(`  ID: ${r.id} | Journal: ${r.journal_id} | Account ID: ${r.account_id} | Dr/Cr: ${r.debit}/${r.credit} | Co: ${r.company_id}`);
  });

  // Check if there are journal lines that are not posted or in draft
  const draftJournals = await client.query(`
    SELECT COUNT(*), SUM(COALESCE((data->>'quantityOnHand')::NUMERIC, 0) * COALESCE((data->>'costPrice')::NUMERIC, 0)) as val
    FROM docs_products
    WHERE COALESCE(quantity_on_hand, 0) > 0
  `);
  console.log(`\nProducts with physical positive stock:`, draftJournals.rows[0]);

  // Let's check some journal entries for opening balances
  const sampleOBs = await client.query(`
    SELECT j.id, j.reference_number, j.company_id, jl.account_id, jl.debit, jl.credit
    FROM docs_journals j
    JOIN docs_journal_lines jl ON jl.journal_id = j.id
    WHERE j.journal_type = 'OPENING_BALANCE'
    LIMIT 20
  `);
  console.log('\nSample Opening Balance Journal Lines:');
  sampleOBs.rows.forEach(r => {
    console.log(`  Ref: ${r.reference_number} | Co: ${r.company_id} | Acc: ${r.account_id} | Dr/Cr: ${r.debit}/${r.credit}`);
  });

  await client.end();
}

run().catch(console.error);
