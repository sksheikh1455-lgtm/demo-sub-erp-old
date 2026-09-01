import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('docs_journals')
    .select('id, reference_number, reference, description, created_by_id, prepared_by, data, journal_type')
    .or(`reference_number.ilike.%1175%,reference.ilike.%1175%,description.ilike.%1175%`);
  
  if (error) { console.error(error); return; }
  
  console.log("Journal entries directly:", data);
}
run();
