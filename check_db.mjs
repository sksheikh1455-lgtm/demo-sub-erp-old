import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: allProducts, error } = await supabase.from('docs_products').select('id, name, company_id, company_ids, data');
  
  if (error) {
    console.error("Error fetching products:", error);
    return;
  }
  
  console.log(`Fetched ${allProducts.length} total products.`);
  
  let sharedProducts = allProducts.filter(p => p.company_ids && p.company_ids.length > 1);
  console.log(`Found ${sharedProducts.length} products shared across multiple companies.`);
  
  if (sharedProducts.length > 0) {
     const p = sharedProducts[0];
     console.log(`Sample shared product - ID: ${p.id}, Name: ${p.name || p.data?.name}, Company IDs: ${p.company_ids}`);
  }
}

check();
