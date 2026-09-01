import { supabase } from '../lib/supabase';

async function run() {
  const { data, error } = await supabase.from('docs_invoices').select('id, data, updated_at').limit(1);
  if (error) {
    console.error("Select error:", error.message);
  } else {
    console.log("Select succeeded. Data:", data);
  }
}
run();
