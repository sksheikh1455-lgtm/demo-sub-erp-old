import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: pay } = await supabase.from('docs_payments').select('*').ilike('reference', '%001175%');
  console.log("Payments:", pay);

  const { data: jor } = await supabase.from('docs_journals').select('*').ilike('reference', '%001175%');
  console.log("Journals:", jor);

  // Maybe the payment has a different prefix? like PAY-SUL-001175? Let's just search by '1175'
  const { data: pay2 } = await supabase.from('docs_payments').select('id, reference').ilike('reference', '%1175%');
  console.log("Payments 1175:", pay2);

  const { data: jor2 } = await supabase.from('docs_journals').select('id, reference, author_id, created_at, status').ilike('reference', '%1175%');
  console.log("Journals 1175:", jor2);
  
}
run();
