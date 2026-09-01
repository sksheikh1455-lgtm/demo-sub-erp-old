import { createClient } from '@supabase/supabase-js';

const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: companies } = await supabase.from('docs_companies').select('id, name');
  const targetComp = companies.find(c => c.name?.toLowerCase().includes('suborno new'));
  
  if (!targetComp) {
    console.log("Suborno New company not found in DB.");
    return;
  }
  
  console.log(`Company found: ${targetComp.name} (ID: ${targetComp.id})`);
  
  const { count, error } = await supabase.from('docs_products')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', targetComp.id);
    
  if (error) {
    console.error("Error fetching products:", error);
  } else {
    console.log(`Total Products in 'Suborno New': ${count}`);
  }
}
run();
