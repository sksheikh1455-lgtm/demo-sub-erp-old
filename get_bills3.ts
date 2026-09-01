import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const vendorId = 'b28a6b62-387d-4ec8-bcd4-88d0ed692f26'; // FIBER SOLUTION
  
  const { data: bills, error } = await supabase.from('docs_bills').select('*');
  console.log('Bills count:', bills?.length, error);
  
  if (bills) {
    const vendorBills = bills.filter(b => b.data?.contactId === vendorId);
    console.log('Vendor bills:', vendorBills.length);
    
    const productIds = new Set<string>();
    vendorBills.forEach(b => {
      const items = b.data?.items || [];
      items.forEach((item: any) => {
        if (item.productId) {
          productIds.add(item.productId);
        }
      });
    });

    console.log('Unique Products:', productIds.size);
    if (productIds.size > 0) {
      const { data: products } = await supabase.from('docs_products').select('id, name, quantity_on_hand, cost_price, data').in('id', Array.from(productIds));
      
      let totalStockValue = 0;
      products?.forEach(p => {
        const qoh = p.quantity_on_hand ?? p.data?.quantityOnHand ?? 0;
        const cost = p.cost_price ?? p.data?.costPrice ?? p.data?.initialCost ?? 0;
        const val = qoh * cost;
        totalStockValue += val;
        console.log(`- ${p.name || p.data?.name}: Qty: ${qoh}, Cost: ${cost}, Total Value: ${val}`);
      });
      console.log('Total Stock Value:', totalStockValue);
    }
  }
}
run();
