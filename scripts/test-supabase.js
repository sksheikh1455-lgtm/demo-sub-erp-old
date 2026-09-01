import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log("Testing connection...");
  const { data, error } = await supabase.from('erp_state').select('*').limit(1);
  if (error) {
    console.error("Error reading erp_state:", error);
  } else {
    console.log("Read success:", data);
  }
  
  const testData = { test: true, time: new Date().toISOString() };
  console.log("Testing upsert...");
  const { error: upsertError } = await supabase.from('erp_state').upsert({ id: 'test_record', data: testData });
  if (upsertError) {
    console.error("Error writing erp_state:", upsertError);
  } else {
    console.log("Write success!");
    // Clean it up
    await supabase.from('erp_state').delete().eq('id', 'test_record');
  }
}

testConnection();
