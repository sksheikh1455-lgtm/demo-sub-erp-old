import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectBills() {
  const { data: bills, error } = await supabase
    .from('docs_bills')
    .select('id, bill_number, status, total, data, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('Error fetching bills:', error);
    return;
  }

  console.log('--- LATEST 10 BILLS ---');
  bills.forEach(b => {
    console.log(`ID: ${b.id}, Number: ${b.bill_number}, Status: ${b.status}, HasData: ${!!b.data}, DataStatus: ${b.data?.status}`);
  });
}

inspectBills();
