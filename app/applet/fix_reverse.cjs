const { Client } = require('pg');
const c = new Client(process.env.DATABASE_URL);

async function run() {
    await c.connect();
    try {
        await c.query('BEGIN');
        
        const q = await c.query(`
            SELECT i.id, i.invoice_number, i.journal_entry_id as cogs_id, j_post.id as post_id
            FROM docs_invoices i
            JOIN docs_journals j_cogs ON j_cogs.id = i.journal_entry_id
            JOIN docs_journals j_post ON j_post.reference_number = i.invoice_number AND j_post.status = 'POSTED' AND j_post.id != i.journal_entry_id
            WHERE j_cogs.status = 'DRAFT' AND j_cogs.id LIKE 'JE-%'
        `);
        
        console.log('Found ' + q.rows.length + ' split journals (reverse linked)');
        
        for (const row of q.rows) {
            await c.query("UPDATE docs_journal_lines SET journal_id = $1 WHERE journal_id = $2", [row.post_id, row.cogs_id]);
            await c.query("UPDATE docs_journals SET status = $2 WHERE id = $1", [row.cogs_id, 'DELETED']);
            await c.query("UPDATE docs_invoices SET journal_entry_id = $1 WHERE id = $2", [row.post_id, row.id]);
        }
        
        await c.query('COMMIT');
        console.log('Fixed reverse linked split journals');
    } catch(err) {
        await c.query('ROLLBACK');
        console.error('Error:', err);
    } finally {
        await c.end();
    }
}
run();
