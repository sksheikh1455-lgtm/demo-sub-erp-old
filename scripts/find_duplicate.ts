import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);


async function run() {
  const { data, error } = await supabase
    .from('docs_payments')
    .select('id, amount, date, updated_at, status, applied_invoices, data')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }
  
  console.log(JSON.stringify(data, null, 2));
}

run();
