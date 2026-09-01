require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data, error } = await supabase.rpc('execute_sql', {
        sql_string: `
            SELECT t.tgname, p.proname, pg_get_functiondef(p.oid) as def
            FROM pg_trigger t
            JOIN pg_proc p ON t.tgfoid = p.oid
            JOIN pg_class c ON t.tgrelid = c.oid
            WHERE c.relname = 'docs_bills';
        `
    }).catch(e => ({ error: e.message }));
    
    // If execute_sql is not available, we can't query system tables directly from JS unless we use a direct Postgres connection. Let's see.
    console.log(JSON.stringify(data || error, null, 2));
}
main();
