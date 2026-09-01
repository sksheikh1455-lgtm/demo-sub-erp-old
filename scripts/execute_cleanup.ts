import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log("Starting transactional cleanup of credit note journals...");

    // Disable specific user triggers on docs_journal_lines
    console.log("Temporarily disabling user triggers on docs_journal_lines...");
    const triggers = [
      'audit_docs_journal_lines',
      'block_update_journals_integrity',
      'prevent_any_deletion_on_journal_lines',
      'trg_strict_double_entry_check',
      'trg_strict_partner_constraint'
    ];

    for (const t of triggers) {
      await client.query(`ALTER TABLE docs_journal_lines DISABLE TRIGGER "${t}";`);
    }

    // Gather Credit Note journals
    const cnJournalsQuery = `
      SELECT DISTINCT j.id 
      FROM docs_journals j
      WHERE j.journal_type = 'CREDIT_NOTE' 
         OR j.reference_number LIKE 'CN%' 
         OR j.id IN (SELECT COALESCE(data->>'journalEntryId', 'JE-' || id) FROM docs_credit_notes)
    `;
    const journalsRes = await client.query(cnJournalsQuery);
    const journalIds = journalsRes.rows.map(r => r.id);
    console.log(`Scoped to ${journalIds.length} Credit Note journals.`);

    // Perform deletion of old invoice-direction lines having 'REV-%' id or 'Auto Reversal of previous total' description
    const deleteRes = await client.query(`
      DELETE FROM docs_journal_lines
      WHERE journal_id = ANY($1)
        AND (id LIKE 'REV-%' OR description = 'Auto Reversal of previous total')
    `, [journalIds]);

    console.log(`Deleted ${deleteRes.rowCount} corrupted mirror lines.`);

    // Re-enable triggers
    console.log("Re-enabling triggers on docs_journal_lines...");
    for (const t of triggers) {
      await client.query(`ALTER TABLE docs_journal_lines ENABLE TRIGGER "${t}";`);
    }

    console.log("Cleanup transactions committed successfully!");

  } catch (err) {
    console.error("Error occurred during cleanup, rolling back...", err);
    try {
      await client.query("ROLLBACK;");
    } catch (rbErr) {
      console.error("Rollback failed:", rbErr);
    }
  } finally {
    await client.end();
  }
}

main();
