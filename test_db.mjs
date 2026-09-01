import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: j, error: e1 } = await supabase.from('docs_journals')
    .select('*')
    .ilike('id', '%245073bc-49a0-4935-a584-730668fa7b5b%');
  
  const { data: jl, error: e2 } = await supabase.from('docs_journal_lines')
    .select('*')
    .ilike('journal_id', '%245073bc-49a0-4935-a584-730668fa7b5b%');
    
  console.log("Journals:", JSON.stringify(j, null, 2));
  console.log("Journal Lines:", JSON.stringify(jl, null, 2));
}
run();
