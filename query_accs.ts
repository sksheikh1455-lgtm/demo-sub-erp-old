import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);
async function run() {
  const { data, error } = await supabase.from('docs_accounts').select('id, data');
  console.log('Count:', data?.length);
  if (data) {
    const cash = data.find(a => a.data?.code === '100100' || a.data?.name?.toLowerCase().includes('cash'));
    const loan = data.find(a => a.data?.code === '210100' || a.data?.name?.toLowerCase().includes('loan'));
    console.log('Cash:', cash);
    console.log('Loan:', loan);
  }
}
run();
