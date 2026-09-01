import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: inv } = await supabase.from('docs_inventory_adjustments').select('id, data').limit(5);
  console.log('Inventory Adjustments:', inv);
  
  const { data: prod } = await supabase.from('docs_products').select('id, name, data');
  console.log('Products:', prod?.length);
  if (prod && prod.length > 0) {
    console.log('Sample product:', prod[0]);
  }
}
run();
