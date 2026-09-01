import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT id, credit_note_number, status, data->>'number' as data_num, data->>'journalEntryId' as data_jeid, data->>'invoiceId' as inv_id
      FROM docs_credit_notes
      ORDER BY updated_at DESC
      LIMIT 10;
    `);
    console.log("=== LATEST CREDIT NOTES ===");
    console.table(res.rows);

    if (res.rows.length > 0) {
      const latestCn = res.rows[0];
      const jid = latestCn.journal_entry_id || latestCn.data_jeid || 'JE-' + latestCn.id;
      console.log(`\n=== JOURNAL LINES FOR JOURNAL ${jid} (Linked to CN ${latestCn.credit_note_number}) ===`);
      const linesRes = await client.query(`
        SELECT jl.*, a.code as acc_code, a.name as acc_name
        FROM docs_journal_lines jl
        LEFT JOIN docs_accounts a ON a.id = jl.account_id
        WHERE jl.journal_id = $1
        ORDER BY jl.debit DESC, jl.credit DESC;
      `, [jid]);
      console.table(linesRes.rows);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
