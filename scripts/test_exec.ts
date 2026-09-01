import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    let sql = fs.readFileSync('scripts/business_logic_rpcs.sql', 'utf8');
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
    console.log("Error:", error);
    console.log("Data:", data);
}
run();
