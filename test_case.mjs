import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: j } = await supabase.from('docs_journals')
    .select('id')
    .ilike('id', '%245073bc-49a0-4935-a584-730668fa7b5b%');
    
  console.log(j);
}
run();
