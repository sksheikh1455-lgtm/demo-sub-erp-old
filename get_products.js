import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function check() {
  const { data: aData, error: aErr } = await supabase.auth.signInWithPassword({
      email: 'admin@sub-erp.com', password: 'password123'
    });
  const res = await supabase.from('docs_products').select('*').limit(1);
  console.log(res);
}
check();
