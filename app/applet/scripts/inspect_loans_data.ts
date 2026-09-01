import { supabase } from '../lib/supabase';
async function run() {
  const { data, error } = await supabase.from('docs_loans').select('*');
  console.log("Loans length:", data?.length);
  if (data?.length) {
    console.log("Sample loan:", JSON.stringify(data[0], null, 2));
  }
}
run();
