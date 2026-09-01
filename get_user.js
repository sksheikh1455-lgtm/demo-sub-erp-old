import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);
// Create a fake random user for signup.
async function main() {
  const email = `testuser_${Date.now()}@gmail.com`;
  const { data: signData, error: signErr } = await supabase.auth.signUp({ 
    email, 
    password: 'password123' 
  });
  if (signErr) { console.log("SignErr:", signErr.message); return; }
  console.log("User created:", signData.user.id);
}
main();
