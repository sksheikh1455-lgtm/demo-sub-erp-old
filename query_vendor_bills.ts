import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: bills } = await supabase.from('docs_bills').select('id, data');
  if (!bills) return;
  
  const { data: contacts } = await supabase.from('docs_contacts').select('id, name').ilike('name', '%fiber%');
  const fiberId = contacts?.[0]?.id;
  if (!fiberId) {
    console.log("No fiber contact found");
    return;
  }
  
  const fiberBills = bills.filter(b => b.data?.vendorId === fiberId);
  console.log('Fiber bills count:', fiberBills.length);
  
  const productIds = new Set<string>();
  const productQuantities: Record<string, {name: string, q: number, cost: number}> = {};
  
  fiberBills.forEach(b => {
    const items = b.data?.items || [];
    items.forEach((item: any) => {
       if (item.productId) {
         productIds.add(item.productId);
       }
    });
  });

  console.log('Unique Products in bills:', productIds.size);
  
  // Wait, the products might be in docs_products, let's fetch them
  if (productIds.size > 0) {
     const { data: prods } = await supabase.from('docs_products').select('id, name, data, quantity_on_hand, cost_price').in('id', Array.from(productIds));
     console.log('Found in docs_products:', prods?.length);
     
     let totalStockValue = 0;
     const prodList = [];
     if (prods && prods.length > 0) {
       prods.forEach(p => {
         const q = p.quantity_on_hand ?? p.data?.quantityOnHand ?? 0;
         const c = p.cost_price ?? p.data?.costPrice ?? p.data?.initialCost ?? 0;
         const val = q * c;
         totalStockValue += val;
         prodList.push({ name: p.name || p.data?.name, stock: q, cost: c, value: val });
       });
     } else {
        // Look through inventory? Or how is inventory tracked?
     }
     console.log('Total Stock Value:', totalStockValue);
     console.table(prodList);
  }
}
run();
