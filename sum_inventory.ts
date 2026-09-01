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
  let from = 0;
  const limit = 1000;
  while(true) {
    const { data: tx, error } = await supabase.from('docs_inventory_transactions').select('data').range(from, from + limit - 1);
    if (!tx || tx.length === 0) break;
    tx.forEach(t => {
       if (t.data?.productId === '244000e6-c9aa-4737-9364-6b7135f030cb') {
           totalQty += (Number(t.data?.quantity) || 0);
       }
    });
    from += limit;
  }
  console.log('Total Current Stock based on transactions:', totalQty);
}
run();
