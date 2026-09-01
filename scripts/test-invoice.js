import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInvoice() {
  const newId = `INV-TEST-${Date.now()}`;
  const newInvoice = {
    id: newId,
    number: '', 
    status: 'DRAFT',
    test: true
  };

  const { data, error } = await supabase
    .from('docs_invoices')
    .insert({ id: newId, data: newInvoice })
    .select('invoice_number, data')
    .single();

  console.log("Error:", error);
  console.log("Data:", data);
  
  // Cleanup
  await supabase.from('docs_invoices').delete().eq('id', newId);
}

testInvoice();
