import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- STARTING COMPREHENSIVE TRANSACTION, PRODUCT, CONTACT AND AUDIT LOG RETRIEVAL AND WIPE ---');

  const tablesToWipe = [
    'docs_invoice_lines',
    'docs_invoices',
    'docs_bill_lines',
    'docs_bills',
    'docs_credit_note_lines',
    'docs_credit_notes',
    'docs_payments',
    'docs_loan_amortization_lines',
    'docs_loans',
    'docs_journal_lines',
    'docs_journals',
    'docs_stock_movements',
    'docs_inventory_adjustments',
    'docs_inventory_transactions',
    'docs_payslips',
    'docs_advance_salaries',
    'docs_attendance',
    'docs_leaves',
    'docs_idempotency_keys',
    'docs_tasks',
    'report_profit_and_loss',
    'docs_product_stocks',
    'docs_product_costs',
    'docs_product_companies',
    'docs_products',
    'docs_contact_companies',
    'docs_contacts',
    'docs_audit_log',
    'docs_audit_logs',
    'docs_system_logs',
    'company_doc_sequences',
    'docs_document_sequences'
  ];

  try {
    // 1. Disable USER triggers (outside transaction to avoid failure propagation)
    console.log('Disabling USER triggers on target tables...');
    for (const table of tablesToWipe) {
      try {
        await client.query(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
        console.log(`  Disabled USER triggers for: ${table}`);
      } catch (err: any) {
        console.log(`  Skipped/Could not disable USER triggers for ${table}: ${err.message}`);
      }
    }

    // 2. Start the transaction for deletions
    await client.query('BEGIN');

    console.log('\nWiping child/dependent tables first...');
    const childTables = [
      'docs_invoice_lines',
      'docs_bill_lines',
      'docs_credit_note_lines',
      'docs_loan_amortization_lines',
      'docs_journal_lines',
      'docs_stock_movements',
      'docs_inventory_adjustments',
      'docs_inventory_transactions',
      'docs_product_stocks',
      'docs_product_costs',
      'docs_product_companies',
      'docs_contact_companies',
      'docs_idempotency_keys',
      'report_profit_and_loss'
    ];

    for (const table of childTables) {
      try {
        const res = await client.query(`DELETE FROM "${table}"`);
        console.log(`  Deleted ${res.rowCount} rows from child table: ${table}`);
      } catch (err: any) {
        console.log(`  Could not delete from child table ${table}: ${err.message}`);
        throw err;
      }
    }

    console.log('\nWiping main transaction tables...');
    const mainTransactionTables = [
      'docs_invoices',
      'docs_bills',
      'docs_credit_notes',
      'docs_payments',
      'docs_loans',
      'docs_journals',
      'docs_payslips',
      'docs_advance_salaries',
      'docs_attendance',
      'docs_leaves',
      'docs_tasks'
    ];

    for (const table of mainTransactionTables) {
      try {
        const res = await client.query(`DELETE FROM "${table}"`);
        console.log(`  Deleted ${res.rowCount} rows from main transaction table: ${table}`);
      } catch (err: any) {
        console.log(`  Could not delete from main transaction table ${table}: ${err.message}`);
        throw err;
      }
    }

    console.log('\nWiping products table...');
    try {
      const res = await client.query('DELETE FROM "docs_products"');
      console.log(`  Deleted ${res.rowCount} rows from docs_products.`);
    } catch (err: any) {
      console.log(`  Could not delete from docs_products: ${err.message}`);
      throw err;
    }

    console.log('\nWiping contacts table (except Cash Sale)...');
    try {
      const resContacts = await client.query(`
        DELETE FROM "docs_contacts"
        WHERE id <> 'contact-cash-sale-global'
        AND LOWER(name) <> 'cash sale'
      `);
      console.log(`  Deleted ${resContacts.rowCount} rows from docs_contacts (retained Cash Sale contact).`);
    } catch (err: any) {
      console.log(`  Could not delete from docs_contacts: ${err.message}`);
      throw err;
    }

    console.log('\nWiping logs & auditing tables...');
    const logTables = [
      'docs_audit_log',
      'docs_audit_logs',
      'docs_system_logs'
    ];

    for (const table of logTables) {
      try {
        const res = await client.query(`DELETE FROM "${table}"`);
        console.log(`  Deleted ${res.rowCount} rows from log table: ${table}`);
      } catch (err: any) {
        console.log(`  Could not delete from log table ${table}: ${err.message}`);
        throw err;
      }
    }

    console.log('\nWiping document sequence tables...');
    const seqTables = [
      'company_doc_sequences',
      'docs_document_sequences'
    ];

    for (const table of seqTables) {
      try {
        const res = await client.query(`DELETE FROM "${table}"`);
        console.log(`  Deleted ${res.rowCount} rows from sequence table: ${table}`);
      } catch (err: any) {
        console.log(`  Could not delete from sequence table ${table}: ${err.message}`);
        throw err;
      }
    }

    // 3. Restart all sequence generators in standard public schemas
    console.log('\nResetting PostgreSQL sequence objects...');
    const seqRes = await client.query(`
      SELECT c.relname as seq_name
      FROM pg_class c 
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'S' AND n.nspname = 'public'
    `);
    
    for (const row of seqRes.rows) {
      const seqName = row.seq_name;
      try {
        await client.query(`ALTER SEQUENCE "${seqName}" RESTART WITH 1`);
        console.log(`  Restarted DB sequence: ${seqName}`);
      } catch (seqErr: any) {
        console.warn(`  Warning: Could not restart sequence ${seqName}: ${seqErr.message}`);
      }
    }

    await client.query('COMMIT');
    console.log('\n--- DATA WIPE AND SEQUENCE RESET COMPLETED SUCCESSFULLY ---');

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('\n!!! ERROR OCCURRED during reset, transactions rolled back !!!', err);
  } finally {
    // ALWAYS re-enable USER triggers to restore database integrity and triggers (outside transaction)
    console.log('\nRe-enabling USER triggers on target tables...');
    for (const table of tablesToWipe) {
      try {
        await client.query(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
        console.log(`  Enabled USER triggers for: ${table}`);
      } catch (err: any) {
        console.log(`  Skipped/Could not enable USER triggers for ${table}: ${err.message}`);
      }
    }
    await client.end();
  }
}

run().catch(console.error);
