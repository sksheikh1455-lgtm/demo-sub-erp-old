import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_general_ledger', {
     p_company_ids: ['comp-1'],
     p_start_date: '2026-06-01',
     p_end_date: '2026-08-31',
     p_partner_ids: null,
     p_partner_type: 'CUSTOMER'
  });
  
  if (error) { console.error(error); return; }
  
  let countSystem = 0;
  let countRaju = 0;
  
  const relevant = data.filter(r => r.reference && r.reference.includes('1175'));
  console.log(relevant);
}
run();
