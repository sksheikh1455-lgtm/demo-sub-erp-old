import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const cnJournalsQuery = `
      SELECT DISTINCT j.id 
      FROM docs_journals j
      WHERE j.journal_type = 'CREDIT_NOTE' 
         OR j.reference_number LIKE 'CN%' 
         OR j.id IN (SELECT COALESCE(data->>'journalEntryId', 'JE-' || id) FROM docs_credit_notes)
    `;

    const res = await client.query(cnJournalsQuery);
    const journalIds = res.rows.map(r => r.id);
    console.log(`Analyzing ${journalIds.length} Credit Note journals...`);

    const statsRes = await client.query(`
      SELECT 
        COUNT(*) as total_lines,
        SUM(CASE WHEN a.sub_type = 'RECEIVABLE' AND jl.debit > 0 THEN 1 ELSE 0 END) as invoice_direction_ar,
        SUM(CASE WHEN a.sub_type = 'REVENUE' AND jl.credit > 0 THEN 1 ELSE 0 END) as invoice_direction_revenue,
        SUM(CASE WHEN a.sub_type = 'INVENTORY' AND jl.credit > 0 THEN 1 ELSE 0 END) as invoice_direction_inventory,
        SUM(CASE WHEN a.sub_type = 'COGS' AND jl.debit > 0 THEN 1 ELSE 0 END) as invoice_direction_cogs,
        
        SUM(CASE WHEN a.sub_type = 'RECEIVABLE' AND jl.credit > 0 THEN 1 ELSE 0 END) as return_direction_ar,
        SUM(CASE WHEN a.sub_type = 'REVENUE' AND jl.debit > 0 THEN 1 ELSE 0 END) as return_direction_revenue,
        SUM(CASE WHEN a.sub_type = 'INVENTORY' AND jl.debit > 0 THEN 1 ELSE 0 END) as return_direction_inventory,
        SUM(CASE WHEN a.sub_type = 'COGS' AND jl.credit > 0 THEN 1 ELSE 0 END) as return_direction_cogs
      FROM docs_journal_lines jl
      JOIN docs_accounts a ON a.id = jl.account_id
      WHERE jl.journal_id = ANY($1)
    `, [journalIds]);

    console.log("=== PRE-CLEANUP LINE ANALYSIS ===");
    console.table(statsRes.rows);

    // Let's print some sample REV- lines to inspect their exact details and accounts
    const sampleRes = await client.query(`
      SELECT jl.id, jl.journal_id, jl.description, jl.debit, jl.credit, a.code as acc_code, a.name as acc_name, a.sub_type
      FROM docs_journal_lines jl
      JOIN docs_accounts a ON a.id = jl.account_id
      WHERE jl.journal_id = ANY($1) AND (jl.description LIKE '%Auto Reversal%' OR jl.id LIKE 'REV-%')
      LIMIT 15;
    `, [journalIds]);
    console.log("\n=== SAMPLE AUTO-REVERSAL LINES ===");
    console.table(sampleRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
