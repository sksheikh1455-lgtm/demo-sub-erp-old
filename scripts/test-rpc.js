import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: companies } = await supabase.from('docs_companies').select('id').limit(1);
  const cid = companies?.[0]?.id;
  console.log('Testing with companyId:', cid);
  
  const { data, error } = await supabase.rpc('get_dashboard_summary', {
    p_company_id: cid,
    p_as_of_date: new Date().toISOString().split('T')[0]
  });
  
  if (error) {
    console.error('RPC Error:', error.message);
  } else {
    console.log('Dashboard Data:', JSON.stringify(data, null, 2));
  }
}

check();
