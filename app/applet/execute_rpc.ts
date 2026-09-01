import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);
async function main() {
    const { data, error } = await supabase.rpc('execute_sql', { sql_string: "SELECT p.proname, pg_get_functiondef(p.oid) as def FROM pg_proc p WHERE pg_get_functiondef(p.oid) LIKE '%Strict Perpetual%';" });
    console.log(JSON.stringify(data || error, null, 2));
}
main().catch(console.error);
