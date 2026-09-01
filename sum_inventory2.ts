import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  let totalQty = 0;
  let totalCost = 0;
  
  const { data: tx, error } = await supabase.from('docs_inventory_transactions').select('*').eq('product_id', '244000e6-c9aa-4737-9364-6b7135f030cb');
  if (tx) {
    tx.forEach(t => {
       const qty = Number(t.quantity) || 0;
       if (t.transaction_type === 'IN') {
         totalQty += qty;
         // average cost could be calculated but let's just get the latest or keep a running total.
         if (t.cost_price) totalCost = t.cost_price; // last cost price
       } else if (t.transaction_type === 'OUT') {
         totalQty -= qty;
       }
    });
  }
  
  console.log('Total transactions:', tx?.length);
  console.log('Total Current Stock based on transactions:', totalQty);
  console.log('Last Cost:', totalCost);
  console.log('Total Value:', totalQty * totalCost);
}
run();
