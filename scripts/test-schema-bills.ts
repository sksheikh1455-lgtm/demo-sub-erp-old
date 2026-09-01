import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Starting a thorough, complete transactional cleanup...");
  
  await client.query("BEGIN;");
  try {
    // 1. Disable constraints and triggers temporarily using postgres session_replication_role
    await client.query("SET session_replication_role = 'replica';");
    console.log("Session replication role set to replica.");
 
    // 2. Perform direct deletions on all transactional and line-item tables
    const tablesToClear = [
      'docs_invoice_lines',
      'docs_invoices',
      'docs_bill_lines',
      'docs_bills',
      'docs_credit_note_lines',
      'docs_credit_notes',
      'docs_payments',
      'docs_journal_lines',
      'docs_journals',
      'docs_loan_amortization_lines',
      'docs_loans',
      'docs_inventory_adjustments',
      'docs_inventory_transactions',
      'docs_stock_movements',
      'docs_product_stocks',
      'docs_product_companies',
      'docs_product_costs',
      'docs_products',
      'docs_commission_targets',
      'docs_leaves',
      'docs_attendance',
      'docs_payslips',
      'docs_advance_salaries',
      'docs_report_jobs'
    ];

    for (const table of tablesToClear) {
      try {
        await client.query(`DELETE FROM ${table}`);
        console.log(`Deleted all records from ${table}`);
      } catch (err: any) {
        console.log(`Table ${table} could not be cleared or does not exist: ${err.message}`);
      }
    }

    // 3. Clear all custom contacts (except contact-cash-sale-global)
    const contactDeleteRes = await client.query("DELETE FROM docs_contacts WHERE id != 'contact-cash-sale-global'");
    console.log(`Cleared contacts (except Cash Sale): deleted ${contactDeleteRes.rowCount} contacts.`);

    // 4. Restore constraint validation and triggers
    await client.query("SET session_replication_role = 'origin';");
    console.log("Session replication role restored to origin.");

    await client.query("COMMIT;");
    console.log("Exhaustive transaction cleanup committed successfully.");
  } catch (error) {
    try {
      await client.query("SET session_replication_role = 'origin';");
    } catch (e) {}
    await client.query("ROLLBACK;");
    console.error("Cleanup failed, transaction rolled back:", error);
  }

  // Double check remaining counts for sanity
  console.log("------ REPORTING POST-CLEANUP ROW COUNTS ------");
  const trackingTables = [
    'docs_invoices',
    'docs_invoice_lines',
    'docs_bills',
    'docs_payments',
    'docs_journals',
    'docs_journal_lines',
    'docs_contacts',
    'docs_products'
  ];
  for (const table of trackingTables) {
    try {
      const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`${table}: ${res.rows[0].count} rows remaining`);
    } catch (e: any) {
      console.log(`${table}: Error reading (${e.message})`);
    }
  }

  // Also verify Cash Sale partner balances manually in docs_journal_lines
  const balanceCheck = await client.query("SELECT SUM(debit - credit) as bal FROM docs_journal_lines WHERE contact_id = 'contact-cash-sale-global'");
  console.log("Verified Cash Sale balance in raw docs_journal_lines:", balanceCheck.rows[0]?.bal || 0);

  await client.end();
}
run();
