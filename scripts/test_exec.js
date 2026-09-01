import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
    let sql = fs.readFileSync('scripts/business_logic_rpcs.sql', 'utf8');
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
    console.log("Error:", error);
    console.log("Data:", data);
}
import fs from 'fs';
run();
