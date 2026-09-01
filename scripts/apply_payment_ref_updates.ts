import pkg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to PostgreSQL database.');

  try {
    // 1. Load and execute update_sync_trigger.sql
    const syncTriggerPath = path.join(process.cwd(), 'scripts', 'update_sync_trigger.sql');
    console.log(`Reading SQL from ${syncTriggerPath}...`);
    const syncTriggerSql = fs.readFileSync(syncTriggerPath, 'utf8');
    await client.query(syncTriggerSql);
    console.log('Successfully updated sync_document_metadata trigger function.');

    // 2. Load and execute update_post_payment_json.sql
    const postPaymentPath = path.join(process.cwd(), 'scripts', 'update_post_payment_json.sql');
    console.log(`Reading SQL from ${postPaymentPath}...`);
    const postPaymentSql = fs.readFileSync(postPaymentPath, 'utf8');
    await client.query(postPaymentSql);
    console.log('Successfully updated post_payment function.');

    // 3. Force trigger running on all docs_payments to populate missing flat columns
    console.log('Running synchronous metadata update on existing payments...');
    const syncRes = await client.query('UPDATE docs_payments SET updated_at = NOW() RETURNING id');
    console.log(`Updated flat metadata for ${syncRes.rowCount} payment records.`);

    // 4. Update references on existing docs_journals that were generated from payments
    console.log('Updating docs_journals references for existing payments...');
    const journalUpdateRes = await client.query(`
      UPDATE docs_journals j
      SET reference_number = COALESCE(p.payment_number, p.id) || CASE WHEN p.reference IS NOT NULL AND p.reference <> '' THEN ' (' || p.reference || ')' ELSE '' END,
          reference = COALESCE(p.payment_number, p.id) || CASE WHEN p.reference IS NOT NULL AND p.reference <> '' THEN ' (' || p.reference || ')' ELSE '' END
      FROM docs_payments p
      WHERE 'JE-' || CASE WHEN p.type IN ('RECEIPT', 'COLLECTION') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(p.id), 'PAY-', ''), 'PAY-', '') = j.id
      RETURNING j.id, j.reference_number
    `);
    console.log(`Updated references for ${journalUpdateRes.rowCount} journal entries.`);

    // 5. Update descriptions on existing docs_journal_lines associated with these payment journals
    console.log('Updating docs_journal_lines descriptions for existing payment journals...');
    const lineUpdateRes = await client.query(`
      UPDATE docs_journal_lines jl
      SET description = CASE 
          WHEN jl.id LIKE '%-liq' THEN 'Payment: ' 
          ELSE 'Reconciliation: ' 
        END || COALESCE(p.payment_number, p.id) || CASE WHEN p.reference IS NOT NULL AND p.reference <> '' THEN ' (' || p.reference || ')' ELSE '' END
      FROM docs_payments p
      JOIN docs_journals j ON 'JE-' || CASE WHEN p.type IN ('RECEIPT', 'COLLECTION') THEN 'CPAY' ELSE 'VPAY' END || '-' || replace(replace(UPPER(p.id), 'PAY-', ''), 'PAY-', '') = j.id
      WHERE jl.journal_id = j.id AND (jl.id LIKE '%-liq' OR jl.id LIKE '%-part')
      RETURNING jl.id
    `);
    console.log(`Updated descriptions for ${lineUpdateRes.rowCount} journal line records.`);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Error executing migration:', err);
  } finally {
    await client.end();
  }
}

main();
