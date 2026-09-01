import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from('docs_products').select('id, name, quantity_on_hand, data').ilike('name', '%BRB CABLE BYA%');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
main();
