import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);
async function test() {
  const { data: signData, error: signErr } = await supabase.auth.signUp({ email: 'test_access12345@gmail.com', password: 'password123' });
  if (signErr) { console.log("Sign:", signErr.message); return; }
  const { data, error } = await supabase.rpc('check_company_access', { v_company_id: 'comp-1' });
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
