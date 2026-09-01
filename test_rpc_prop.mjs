import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_general_ledger', {
     p_company_ids: ['comp-1'],
     p_start_date: '1970-01-01',
     p_end_date: '2099-12-31'
  });
  
  if (error) { console.error(error); return; }
  
  console.log("Keys of a row:", Object.keys(data[0] || {}));
}
run();
