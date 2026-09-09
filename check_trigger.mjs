import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
// Use service role key if available, else standard query might fail
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_general_ledger', { p_company_ids: [], p_start_date: '2000-01-01', p_end_date: '2000-01-01' });
  console.log("Just checking if we can run RPCs to test connection...");
}
run();
