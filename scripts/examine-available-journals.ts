import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- EXAMINING DETAILED JOURNAL METADATA ---');

  // Let's get breakdown of journal types
  const typeBreakdown = await client.query(`
    SELECT journal_type, status, COUNT(*) as count 
    FROM docs_journals 
    GROUP BY journal_type, status
  `);
  console.log('Breakdown by journal_type and status:');
  typeBreakdown.rows.forEach(r => {
    console.log(`  Journal Type: ${r.journal_type} | Status: ${r.status} | Count: ${r.count}`);
  });

  // Let's print a sample of 20 journals grouped by type
  const samples = await client.query(`
    SELECT id, reference_number, date, journal_type, status, company_id, (data->>'description') as desc, (data->>'reference') as ref_data
    FROM docs_journals
    ORDER BY date DESC, id DESC
    LIMIT 20
  `);
  console.log('\nSample of 20 journals:');
  samples.rows.forEach(r => {
    console.log(`  Ref: ${r.reference_number} | Type: ${r.journal_type} | Status: ${r.status} | Date: ${r.date} | Desc: ${r.desc} | RefData: ${r.ref_data}`);
  });

  // Let's search inside docs_journal_lines to see what accounts have balances
  const accountsBal = await client.query(`
    SELECT a.code, a.name, SUM(jl.debit) as debits, SUM(jl.credit) as credits, SUM(jl.debit - jl.credit) as balance
    FROM docs_journal_lines jl
    JOIN docs_accounts a ON a.id = jl.account_id
    GROUP BY a.code, a.name
    ORDER BY balance DESC
  `);
  console.log('\nBalances of affected accounts:');
  accountsBal.rows.forEach(r => {
    console.log(`  Code: ${r.code} | Name: ${r.name} | Dr: ${r.debits} | Cr: ${r.credits} | Balance: ${r.balance}`);
  });

  await client.end();
}

run().catch(console.error);
