import { supabase } from './lib/supabase.js'; async function x(){ const {data} = await supabase.from('docs_products').select('data').limit(1); console.log(JSON.stringify(data));} x();
