import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function test() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
     email: 'raihansheikh145@gmail.com',
     password: 'password'
  });
  // even if auth fails, we can just fetch the policies using rpc if we had it, but we don't.
  // Is there any endpoint?
}
test();
