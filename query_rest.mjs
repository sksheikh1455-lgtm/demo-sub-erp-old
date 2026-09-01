import { createClient } from '@supabase/supabase-js';

const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: companies } = await supabase.from('docs_companies').select('*');
  const src = companies.find(c => c.data?.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1');
  const tgt = companies.find(c => c.data?.name === 'SUBORNO NEW');
  
  if (!src || !tgt) return console.log("Missing companies");
  
  // Count src products
  const { count: srcCount } = await supabase.from('docs_products').select('*', { count: 'exact', head: true }).eq('company_id', src.id);
  const { count: tgtCount } = await supabase.from('docs_products').select('*', { count: 'exact', head: true }).eq('company_id', tgt.id);
  
  console.log(`Src (${src.data.name}) products: ${srcCount}`);
  console.log(`Tgt (${tgt.data.name}) products: ${tgtCount}`);

  if (tgtCount > 0) {
     const { data: tgtProds } = await supabase.from('docs_products').select('data').eq('company_id', tgt.id).limit(2);
     console.log("Sample tgt products:", JSON.stringify(tgtProds, null, 2));
  }
}
run();
