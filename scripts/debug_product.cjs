
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supa = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supa.from('docs_products').select('*').limit(3);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
check();
