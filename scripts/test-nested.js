import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const client = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await client.from('docs_invoices').select('*, docs_invoice_lines(*)').limit(1);
  console.log(error ? error : "Success", data?.length);
}
run();
