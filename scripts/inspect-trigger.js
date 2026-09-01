import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTrigger() {
  const { data, error } = await supabase.rpc('get_trigger_def', { trigger_name: 'generate_inventory_movements' });
  // Since get_trigger_def might not exist, let's query pg_proc directly or select the function definition
  const { data: procData, error: procError } = await supabase.rpc('inspect_proc', { proc_name: 'generate_inventory_movements' });
  console.log('Result proc:', procData, procError);
}

// Alternatively, let's write a generic query runner to inspect the DB
async function runQuery() {
  const { data, error } = await supabase.rpc('run_sql', { sql_query: "SELECT prosrc FROM pg_proc WHERE proname = 'generate_inventory_movements'" });
  console.log('SQL Result:', data, error);
}

runQuery();
