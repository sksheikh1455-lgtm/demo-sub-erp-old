import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('Fetching all POSTED credit notes from the database...');
    const result = await client.query(`
      SELECT id, company_id, credit_note_number, status, data
      FROM docs_credit_notes
      WHERE status = 'POSTED'
      ORDER BY updated_at DESC
    `);

    const creditNotes = result.rows;
    console.log(`Found ${creditNotes.length} posted credit notes. Beginning clean-up and reposting...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < creditNotes.length; i++) {
      const cn = creditNotes[i];
      const cnNumber = cn.credit_note_number || (cn.data && cn.data.number) || 'UnknownCN';
      
      // 1. Resolve journal entry ID
      let journalId = cn.journal_id || (cn.data && cn.data.journalEntryId);
      if (!journalId) {
        // Try looking up in docs_journals
        const refNum = cn.credit_note_number || (cn.data && cn.data.number);
        if (refNum) {
          const jnlRes = await client.query(
            'SELECT id FROM docs_journals WHERE company_id = $1 AND reference_number = $2 LIMIT 1',
            [cn.company_id, refNum]
          );
          if (jnlRes.rows.length > 0) {
            journalId = jnlRes.rows[0].id;
          }
        }
      }
      
      if (!journalId) {
        journalId = 'JE-' + cn.id.replace(/CN-/gi, '').toUpperCase();
      }

      console.log(`[${i + 1}/${creditNotes.length}] Repairing CN ${cn.id} (${cnNumber}) - Journal: ${journalId}...`);

      try {
        // Start a mini transaction for this specific credit note row to keep it isolated and fast
        await client.query('BEGIN');

        // Delete all old journal lines for this journal ID (clears all duplicates and REV- lines)
        await client.query('DELETE FROM docs_journal_lines WHERE journal_id = $1', [journalId]);

        // Place the journal status back to DRAFT temporarily so that post_credit_note doesn't bypass posting
        await client.query('UPDATE docs_journals SET status = \'DRAFT\' WHERE id = $1', [journalId]);

        // Call the database posting RPC to cleanly and perfectly generate the balanced aggregated lines
        const postRes = await client.query('SELECT public.post_credit_note($1, $2) as res', [cn.id, cn.company_id]);

        await client.query('COMMIT');
        
        console.log(`  -> SUCCESS! Reposted CN ${cnNumber} successfully.`);
        successCount++;
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`  -> FAILED to repost CN ${cnNumber}:`, err.message);
        failCount++;
      }
    }

    console.log(`\n==================================================`);
    console.log(`REPOSTING COMPLETE!`);
    console.log(`Success: ${successCount} credit notes reposted/repaired.`);
    console.log(`Failed: ${failCount} credit notes failed.`);
    console.log(`==================================================`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

main();
