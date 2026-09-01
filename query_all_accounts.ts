import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: allAccounts } = await supabase.from('docs_accounts').select('id, data');
  console.log('Total accounts:', allAccounts?.length);
  const receivables = allAccounts?.filter(a => JSON.stringify(a.data).toLowerCase().includes('receiv'));
  const payables = allAccounts?.filter(a => JSON.stringify(a.data).toLowerCase().includes('payab'));
  
  console.log('Receivables:', receivables?.map(a => ({id: a.id, name: a.data?.name, type: a.data?.type})));
  console.log('Payables:', payables?.map(a => ({id: a.id, name: a.data?.name, type: a.data?.type})));
}
run();
