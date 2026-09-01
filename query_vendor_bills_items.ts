import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: bills } = await supabase.from('docs_bills').select('id, data');
  const { data: contacts } = await supabase.from('docs_contacts').select('id, name').ilike('name', '%fiber%');
  const fiberId = contacts?.[0]?.id;
  
  const fiberBills = bills?.filter(b => b.data?.vendorId === fiberId) || [];
  
  fiberBills.forEach(b => {
    console.log(`Bill ${b.data?.number}:`);
    console.log(b.data?.items);
  });
}
run();
