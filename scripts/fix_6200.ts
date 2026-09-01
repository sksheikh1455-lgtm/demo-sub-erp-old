import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const c = new Client({ connectionString });
  await c.connect();

  console.log("Fixing overpayments and deleting duplicate invoice 57...");

  // Delete invoice 57 and its auto-payment since it's a duplicate of 56
  // Invoice 57 ID: 80fd80f2-9169-4bed-abc7-710d5ec521de
  // Payment ID: PAY-AUTO-80fd80f2-9169-4bed-abc7-710d5ec521de
  
  // Disable triggers temporarily
  await c.query("ALTER TABLE docs_payments DISABLE TRIGGER USER");
  await c.query("ALTER TABLE docs_invoices DISABLE TRIGGER USER");
  await c.query("ALTER TABLE docs_journals DISABLE TRIGGER USER");
  await c.query("ALTER TABLE docs_journal_lines DISABLE TRIGGER USER");

  try {
    await c.query("DELETE FROM docs_journal_lines WHERE journal_id IN ('JE-INV-80FD80F2-9169-4BED-ABC7-710D5EC521DE', 'JE-CPAY-AUTO-80FD80F2-9169-4BED-ABC7-710D5EC521DE')");
    await c.query("DELETE FROM docs_journals WHERE id IN ('JE-INV-80FD80F2-9169-4BED-ABC7-710D5EC521DE', 'JE-CPAY-AUTO-80FD80F2-9169-4BED-ABC7-710D5EC521DE')");
    await c.query("DELETE FROM docs_payments WHERE id = 'PAY-AUTO-80fd80f2-9169-4bed-abc7-710d5ec521de'");
    await c.query("DELETE FROM docs_invoices WHERE id = '80fd80f2-9169-4bed-abc7-710d5ec521de'");
  } finally {
    // Enable triggers
    await c.query("ALTER TABLE docs_payments ENABLE TRIGGER USER");
    await c.query("ALTER TABLE docs_invoices ENABLE TRIGGER USER");
    await c.query("ALTER TABLE docs_journals ENABLE TRIGGER USER");
    await c.query("ALTER TABLE docs_journal_lines ENABLE TRIGGER USER");
  }

  
  console.log("Duplicate 6200 invoice/payment deleted.");
  
  await c.end();
}

run();
