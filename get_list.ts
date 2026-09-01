import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    // Fetch payments where multiple journal lines have the same contact_id
    const res = await client.query(`
      SELECT DISTINCT p.data->>'number' as payment_number
      FROM docs_payments p
      JOIN docs_journal_lines jl1 ON p.data->>'journalEntryId' = jl1.journal_id
      JOIN docs_journal_lines jl2 ON p.data->>'journalEntryId' = jl2.journal_id
      WHERE jl1.contact_id IS NOT NULL 
        AND jl1.contact_id = jl2.contact_id 
        AND jl1.id != jl2.id
      LIMIT 100;
    `);
    
    const countRes = await client.query(`
      SELECT COUNT(DISTINCT p.data->>'number') as total
      FROM docs_payments p
      JOIN docs_journal_lines jl1 ON p.data->>'journalEntryId' = jl1.journal_id
      JOIN docs_journal_lines jl2 ON p.data->>'journalEntryId' = jl2.journal_id
      WHERE jl1.contact_id IS NOT NULL 
        AND jl1.contact_id = jl2.contact_id 
        AND jl1.id != jl2.id;
    `);

    console.log("Total affected payments:", countRes.rows[0].total);
    console.log("List (up to 100):", res.rows.map(r => r.payment_number).join(', '));
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
