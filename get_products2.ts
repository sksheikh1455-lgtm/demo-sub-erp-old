import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: products } = await supabase.from('docs_products').select('id, name, quantity_on_hand, cost_price, data');
  console.log('Total Products:', products?.length);
  if (products) {
    const fiberProducts = products.filter(p => {
       const d = JSON.stringify(p.data || {}).toLowerCase();
       return d.includes('b28a6b62-387d-4ec8-bcd4-88d0ed692f26') || d.includes('fiber solution');
    });
    console.log('Fiber Products:', fiberProducts.length);
    console.log(fiberProducts.map(p => ({name: p.name, q: p.quantity_on_hand})));
  }
}
run();
