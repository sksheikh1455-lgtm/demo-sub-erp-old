import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: bills, error } = await supabase.from('docs_bills').select('*');
  console.log('Bills loaded:', bills?.length);

  const vendorId = 'b28a6b62-387d-4ec8-bcd4-88d0ed692f26'; // FIBER SOLUTION
  if (bills) {
    const vendorBills = bills.filter(b => b.data?.contactId === vendorId);
    
    const productIds = new Set<string>();
    vendorBills.forEach(b => {
      const items = b.data?.items || [];
      items.forEach((item: any) => {
        if (item.productId) {
          productIds.add(item.productId);
        }
      });
    });

    if (productIds.size > 0) {
      const { data: products } = await supabase.from('docs_products').select('*').in('id', Array.from(productIds));
      console.log('Products:', products?.map(p => ({name: p.name, qty: p.quantity_on_hand, val: (p.quantity_on_hand||0)*(p.cost_price||0)})));
    } else {
        console.log("No products from this vendor found in bills.");
    }
  }
}
run();
