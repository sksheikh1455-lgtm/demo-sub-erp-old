import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY); // Actually this won't work due to RLS!

async function run() {
  const { data: cpays } = await supabase.from('docs_journals').select('id').or('id.ilike.JE-CPAY-%,id.ilike.JE-VPAY-%');
  
  if (!cpays) {
     console.log("No cpays found");
     return;
  }
  console.log(`Found ${cpays.length} CPAY/VPAY`);
  
  const toDelete = cpays.map(c => 'JE-PAY-' + c.id.replace('JE-CPAY-', '').replace('JE-VPAY-', ''));
  
  // RLS might block delete from anon key
  console.log("To delete:", toDelete.slice(0, 5));
}
run();
