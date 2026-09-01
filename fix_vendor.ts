import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  // 1. Find the target contact
  const { data: contacts } = await supabase
    .from('docs_contacts')
    .select('id, name')
    .ilike('name', '%CLICK ELECTRICAL ACCESSORIES%');
  
  console.log("Found contacts:", contacts);

  // 2. Find the bill
  const { data: bills } = await supabase
    .from('docs_bills')
    .select('id, data')
    .ilike('data->>number', '%BILL-SUL-000213%');
    
  console.log("Found bills:", bills);
}
run();
