import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
    const { data, error } = await supabase.rpc('post_expense', {});
    console.log("post_expense error:", error);
    const { data: d2, error: e2 } = await supabase.rpc('process_payment', {});
    console.log("process_payment error:", e2);
}
run();
