import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Checking RLS on docs_users");
  
  // Can we update a user using ANON key directly? Probably not without an active session.
  // We don't have the user's token.
  const { data: users, error } = await supabase.from('docs_users').select('id, name, email');
  console.log("Users:", users, "Error:", error);
}
run();
