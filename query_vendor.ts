import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkVendor() {
  const { data, error } = await supabase
    .from('docs_contacts')
    .select('id, name, type, company_id, data')
    .ilike('name', '%global electric%');
    
  if (error) {
    console.error('Error fetching vendor:', error);
  } else {
    console.log('Vendor found:', JSON.stringify(data, null, 2));
  }
}

checkVendor();
