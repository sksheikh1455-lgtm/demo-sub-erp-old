import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: journals } = await supabase.from('docs_journals').select('id, reference, status, author_id, created_at, data').ilike('reference', '%001175%');
  console.log("Journals (ilike 001175):", journals?.map(j => ({ id: j.id, ref: j.reference, author: j.author_id })));
  
  const { data: payments } = await supabase.from('docs_payments').select('id, reference, status, author_id, created_at, data').ilike('reference', '%001175%');
  console.log("Payments (ilike 001175):", payments?.map(j => ({ id: j.id, ref: j.reference, author: j.author_id })));
}
check();
