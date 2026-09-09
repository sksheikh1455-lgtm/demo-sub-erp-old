import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: userEmail } = await supabase.rpc('get_user_email', { p_username: 'kabir' });
  const { data: auth } = await supabase.auth.signInWithPassword({
     email: userEmail,
     password: '123400' 
  });
  
  // Try fetch using REST api directly to bypass RLS? No, REST respects RLS.
  // Wait, does docs_users allow anon select? We saw earlier it doesn't.
  
  // Is there any RPC to get users?
  const { data: rpcs } = await supabase.rpc('get_users');
  console.log("get_users:", rpcs);
}
run();
