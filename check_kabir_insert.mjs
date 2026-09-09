import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: userEmail } = await supabase.rpc('get_user_email', { p_username: 'kabir' });
  const { data: auth } = await supabase.auth.signInWithPassword({
     email: userEmail,
     password: '123400' // If I don't know the password I can't test it.
  });
}
run();
