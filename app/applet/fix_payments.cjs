const { Client } = require('pg');
const c = new Client(process.env.DATABASE_URL);
c.connect().then(async () => {
    try {
        const res = await c.query(`
            SELECT p.id,
                   CASE 
                    WHEN p.type IN ('RECEIPT', 'COLLECTION', 'REFUND') AND p.id LIKE 'PAY-AUTO-%' THEN 'JE-CPAY-AUTO-' || REPLACE(REPLACE(UPPER(p.id), 'PAY-AUTO-', ''), 'PAY-', '')
                    WHEN p.type IN ('RECEIPT', 'COLLECTION', 'REFUND') THEN 'JE-CPAY-' || REPLACE(REPLACE(UPPER(p.id), 'PAY-', ''), 'PAY-', '')
                    WHEN p.id LIKE 'PAY-AUTO-%' THEN 'JE-VPAY-AUTO-' || REPLACE(REPLACE(UPPER(p.id), 'PAY-AUTO-', ''), 'PAY-', '')
                    ELSE 'JE-VPAY-' || REPLACE(REPLACE(UPPER(p.id), 'PAY-', ''), 'PAY-', '')
                END as expected_j_id
            FROM docs_payments p
            WHERE p.date >= '2026-06-10' AND p.status = 'POSTED'
        `);
        
        let fixedCount = 0;
        for (const row of res.rows) {
            const jCheck = await c.query('SELECT count(*) as count FROM docs_journal_lines WHERE journal_id = $1', [row.expected_j_id]);
            if (parseInt(jCheck.rows[0].count) === 0) {
                console.log('Fixing payment:', row.id, row.expected_j_id);
                // Set journal to DRAFT
                await c.query("UPDATE docs_journals SET status = 'DRAFT' WHERE id = $1", [row.expected_j_id]);
                // Set payment to DRAFT
                await c.query("UPDATE docs_payments SET status = 'DRAFT' WHERE id = $1", [row.id]);
                // Repost
                await c.query("SELECT post_payment($1)", [row.id]);
                fixedCount++;
            }
        }
        console.log('Fixed count:', fixedCount);
    } catch(e) { console.error(e); }
    c.end();
});
