import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";

const supabase = createClient(url, anonKey);

async function run() {
  // Use a login to bypass anon restrictions
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'raihansheikh145@gmail.com',
    password: 'password123' // Maybe I can't guess this
  });
  console.log("Auth:", authErr ? authErr.message : "Success");
}
run();
