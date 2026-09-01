const fs = require('fs');
const { Client } = require('pg');
const c = new Client(process.env.DATABASE_URL);
c.connect().then(async () => {
    try {
        const funcs = ['post_bill', 'post_credit_note', 'post_invoice', 'post_invoice_v2', 'post_payment'];
        let out = '';
        for (const fn of funcs) {
            const q = await c.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = $1 AND pronamespace = 'public'::regnamespace ORDER BY oid LIMIT 1", [fn]);
            if (!q.rows[0]) continue;
            let text = q.rows[0].def;
            
            // We want to replace the block that updates the date.
            text = text.replace(/UPDATE docs_invoices\s+SET date = \(NOW\(\) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia\/Dhaka'\)::date[^;]+;/gi, '-- Removed date override');
            text = text.replace(/UPDATE docs_bills\s+SET date = \(NOW\(\) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia\/Dhaka'\)::date[^;]+;/gi, '-- Removed date override');
            text = text.replace(/UPDATE docs_payments\s+SET date = \(NOW\(\) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia\/Dhaka'\)::date[^;]+;/gi, '-- Removed date override');
            text = text.replace(/UPDATE docs_credit_notes\s+SET date = \(NOW\(\) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia\/Dhaka'\)::date[^;]+;/gi, '-- Removed date override');
            
            out += text + ';\n\n';
        }
        fs.writeFileSync('scripts/fix_dates_override.sql', out);
        console.log('Script written');
    } catch(e) { console.error('Error:', e); } 
    c.end();
});
