import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: invoices } = await supabase.from('docs_invoices').select('id, data');
  console.log('Invoices loaded:', invoices?.length);
  
  if (invoices) {
    let soldQuantity = 0;
    invoices.forEach(inv => {
      const items = inv.data?.items || [];
      items.forEach((item: any) => {
        if (item.productId === '244000e6-c9aa-4737-9364-6b7135f030cb') {
          soldQuantity += Number(item.quantity) || 0;
        }
      });
    });
    console.log('Total Sold:', soldQuantity);
  }
}
run();
