import { createClient } from '@supabase/supabase-js';

const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: companies } = await supabase.from('docs_companies').select('id, data');
  const targetComp = companies?.find(c => c.data?.name === 'SUBORNO NEW');
  
  if (!targetComp) {
     console.log("No target company found.");
     return;
  }
  
  const { count } = await supabase.from('docs_products').select('*', { count: 'exact', head: true }).eq('company_id', targetComp.id);
  console.log(`Products in SUBORNO NEW: ${count}`);
}
run();
