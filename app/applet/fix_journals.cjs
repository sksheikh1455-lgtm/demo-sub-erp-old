const { Client } = require('pg');
const c = new Client(process.env.DATABASE_URL);

async function run() {
    await c.connect();
    try {
        await c.query('BEGIN');
        
        const q = await c.query(`
            SELECT j1.id as original_id, j2.id as cogs_id
            FROM docs_invoices i
            JOIN docs_journals j1 ON j1.id = i.journal_entry_id
            JOIN docs_journals j2 ON j2.id = 'JE-' || replace(replace(UPPER(i.id), 'INV-', ''), 'INVOICE-', '')
            WHERE j1.id != j2.id AND j2.status = 'DRAFT'
        `);
        
        console.log(`Found ${q.rows.length} split journals`);
        
        for (const row of q.rows) {
            // Update the journal_id of lines in the DRAFT cogs_id to the generic original_id
            await c.query(`
                UPDATE docs_journal_lines
                SET journal_id = $1
                WHERE journal_id = $2
            `, [row.original_id, row.cogs_id]);
            
            // Delete the orphaned DRAFT journal
            await c.query(`
                DELETE FROM docs_journals WHERE id = $1
            `, [row.cogs_id]);
        }
        
        await c.query('COMMIT');
        console.log('Fixed historical split journals');
    } catch(err) {
        await c.query('ROLLBACK');
        console.error('Error:', err);
    } finally {
        await c.end();
    }
}
run();
