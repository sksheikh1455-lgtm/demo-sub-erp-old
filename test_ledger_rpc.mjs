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
  
  if (error) console.error(error);
  
  const entries = data.filter(r => (r.reference && r.reference.includes('1175')) || (r.description && r.description.includes('1175')));
  console.log("Ledger entries for 1175:", entries.map(e => ({
     id: e.journal_id,
     ref: e.reference,
     desc: e.description,
     prep: e.preparedBy || e.prepared_by,
     author: e.author_id || e.created_by_id,
     deb: e.debit,
     cred: e.credit
  })));
}
run();
