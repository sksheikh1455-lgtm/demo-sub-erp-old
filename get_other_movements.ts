import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: invs } = await supabase.from('docs_inventory_adjustments').select('id, data');
  let adjQuantity = 0;
  if (invs) {
    invs.forEach(inv => {
      const items = inv.data?.items || [];
      items.forEach((item: any) => {
        if (item.productId === '244000e6-c9aa-4737-9364-6b7135f030cb') {
           // check if adjustment is ADD or REMOVE or just difference
           adjQuantity += Number(item.quantityDifference) || 0;
        }
      });
    });
  }
  
  const { data: returns } = await supabase.from('docs_credit_notes').select('id, data');
  let returnQuantity = 0;
  if (returns) {
    returns.forEach(ret => {
      const items = ret.data?.items || [];
      items.forEach((item: any) => {
        if (item.productId === '244000e6-c9aa-4737-9364-6b7135f030cb') {
           returnQuantity += Number(item.quantity) || 0;
        }
      });
    });
  }

  console.log('Adjustments:', adjQuantity);
  console.log('Returns:', returnQuantity);
}
run();
