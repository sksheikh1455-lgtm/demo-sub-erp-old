import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function test() {
  const { data, error } = await supabase.rpc('get_bulletproof_sql', { sql_query: "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public'" });
  console.log(error || data);
}
test();
