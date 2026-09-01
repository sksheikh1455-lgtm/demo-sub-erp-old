import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: j, error: e1 } = await supabase.from('docs_journals')
    .select('id, reference_number, reference, journal_type, description, created_by_id, prepared_by')
    .or('reference_number.ilike.%1175%,reference.ilike.%1175%,description.ilike.%1175%');
    
  console.log("Journals for 1175:");
  console.log(JSON.stringify(j, null, 2));
}
run();
