import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'raihansheikh145@gmail.com',
    password: 'password'
  });
  if (authErr) {
    console.log("Auth err:", authErr);
    // Can we fetch users table using service key? We don't have it.
    // Try to login as raihan with password 123400?
  }
}
run();
