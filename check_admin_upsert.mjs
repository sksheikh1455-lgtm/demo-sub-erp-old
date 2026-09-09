import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
     email: 'raihansheikh145@gmail.com',
     password: '1234' // Wait, I know raihan's pw is not 1234, I tried it and it failed.
  });
}
run();
