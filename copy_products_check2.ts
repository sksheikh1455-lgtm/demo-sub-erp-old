import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: companies, error: cErr } = await supabase.from('docs_companies').select('*');
  console.log("Companies Error:", cErr);
  console.log("Companies:", companies?.map(c => ({id: c.id, data_name: c.data?.name})));

  let sourceId = companies?.find(c => c.data?.name === 'SUBORNO ELECTRIC')?.id;
  let targetId = companies?.find(c => c.data?.name === 'SUBORNO NEW')?.id;

  if (!sourceId && companies?.find(c => c.id === 'comp-1')) {
      sourceId = 'comp-1'; // fallback
  }

  console.log(`Source ID: ${sourceId}, Target ID: ${targetId}`);

  if (sourceId) {
    const { data: products } = await supabase.from('docs_products').select('*').eq('company_id', sourceId);
    console.log(`Found ${products?.length} products using company_id column.`);
    
    if (products && products.length > 0) {
        console.log("Sample product data:", JSON.stringify(products[0].data, null, 2));
    }
  }
}
run();
