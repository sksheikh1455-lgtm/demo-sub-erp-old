const { Client } = require('pg');
const c = new Client(process.env.DATABASE_URL);
c.connect().then(async () => {
    try {
        await c.query("BEGIN;");
        
        let q_post_payment = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'post_payment'`);
        let sql_post_payment = q_post_payment.rows[0].prosrc;
        sql_post_payment = sql_post_payment.replace(
            "DELETE FROM docs_journal_lines WHERE journal_id = v_journal_id;",
            `INSERT INTO docs_journal_lines (id, journal_id, company_id, account_id, contact_id, debit, credit, description)
    SELECT 'REV-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 10), journal_id, company_id, account_id, contact_id,
           CASE WHEN sum(debit - credit) < 0 THEN abs(sum(debit - credit)) ELSE 0 END,
           CASE WHEN sum(debit - credit) > 0 THEN sum(debit - credit) ELSE 0 END,
           'Auto Reversal of previous total'
    FROM docs_journal_lines 
    WHERE journal_id = v_journal_id
    GROUP BY journal_id, company_id, account_id, contact_id
    HAVING sum(debit - credit) != 0;`
        );
        sql_post_payment = sql_post_payment.replace(/substring\(md5\(random\(\)::text\) from 1 for 10\)/g, "substring(md5(random()::text || clock_timestamp()::text) from 1 for 10)");
        
        console.log("Updated post_payment logic length:", sql_post_payment.length);

        await c.query(`CREATE OR REPLACE FUNCTION post_payment(p_payment_id TEXT, p_company_id TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql AS $$\n` + sql_post_payment + `\n$$;`);
        
        let q_create = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'create_journal_entry'`);
        let sql_create = q_create.rows[0].prosrc;
        
        sql_create = sql_create.replace(
            /COALESCE\(v_line->>'id',\s*'JL-'\s*\|\|\s*v_journal_id\s*\|\|\s*'-'\s*\|\|\s*floor\(random\(\)\*1000000\)::text\),/g,
            `'JL-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 10),`
        );
        sql_create = sql_create.replace(
            /SELECT 'REV-' \|\| substring\(md5\(random\(\)::text\) from 1 for 10\)/g,
            `SELECT 'REV-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 10)`
        );

        console.log("Updated create_journal_entry logic length:", sql_create.length);
        
        await c.query(`CREATE OR REPLACE FUNCTION create_journal_entry(p_journal_data JSONB, p_company_id TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql AS $$\n` + sql_create + `\n$$;`);

        await c.query("COMMIT;");
        console.log("Functions updated successfully");
    } catch(e) { 
        await c.query("ROLLBACK;");
        console.error(e); 
    }
    c.end();
});
