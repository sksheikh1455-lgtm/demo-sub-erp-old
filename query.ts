import { createClient } from '@supabase/supabase-js';

const url = 'https://buspgzsamhfmjrmmwpmo.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM';
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('docs_bills')
    .select('*')
    .or("bill_number.eq.BIL-SUL-000336,data->>number.eq.BIL-SUL-000336")
    .limit(1);
    
  console.log("Bill:", data, error);
  if (data && data.length > 0) {
     const { data: lines } = await supabase.from('docs_bill_lines').select('*').eq('bill_id', data[0].id);
     console.log("Lines:", lines);
     
     const { data: trans } = await supabase.from('docs_inventory_transactions').select('*').eq('reference_id', data[0].id);
     console.log("Transactions:", trans);
  }
}
run();
