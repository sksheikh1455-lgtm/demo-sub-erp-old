import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const tables = ['products', 'contacts', 'invoices', 'bills', 'companies'];
  for (const table of tables) {
    try {
      const { data, count, error } = await supabase.from(table).select('*', { count: 'exact' }).limit(3);
      console.log(`Legacy ${table}: ${count} rows (Error: ${error?.message || 'none'})`);
      if (data && data.length > 0) {
        console.log(`First row data for legacy ${table}:`, JSON.stringify(data[0], null, 2));
      }
    } catch(err) {
      console.error(`Table ${table} check failed:`, err);
    }
  }
}

check();
