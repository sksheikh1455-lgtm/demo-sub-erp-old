import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: allJournals, error } = await supabase.from('docs_journals')
    .select('id, reference, status, prepared_by, created_by_id, created_at, journal_type')
    .ilike('reference', '%001175%');
  
  console.log("Error:", error);
  console.log("Matching Journals:", allJournals);
}
run();
