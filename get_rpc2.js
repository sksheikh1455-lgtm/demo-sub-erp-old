import { createClient } from '@supabase/supabase-js';

const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.rpc('process_invoice', {
    p_invoice: { id: "test-inv-99", companyId: "comp-1", date: "2026-07-13", customerId: "cust-1", items: [{productId: "prod-1", quantity: 1, unitPrice: 100}] }
  });
  console.log('rpc process_invoice output:', data);
  console.log('rpc error:', error);
}
run();
