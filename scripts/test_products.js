import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supa = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supa.from('docs_products').select('id, company_id, data').limit(10);
  console.log("Products:", data, error);
}
test();
