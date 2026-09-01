import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const vendorId = 'b28a6b62-387d-4ec8-bcd4-88d0ed692f26';

  let allBills: any[] = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    const { data: bills } = await supabase.from('docs_bills').select('id, data').range(from, from + limit - 1);
    if (!bills || bills.length === 0) break;
    allBills = allBills.concat(bills);
    from += limit;
  }
  
  const fiberBills = allBills.filter(b => b.data?.vendorId === vendorId || b.data?.contactId === vendorId);
  console.log('Total Bills for vendor:', fiberBills.length);

  const productIds = new Set<string>();
  const productNames = new Set<string>();

  fiberBills.forEach(b => {
    const items = b.data?.items || [];
    items.forEach((item: any) => {
       if (item.productId) {
         productIds.add(item.productId);
         productNames.add(item.description || item.name);
       }
    });
  });

  console.log('Products from Bills:');
  console.log(Array.from(productNames));

  // Also let's check inventory transactions if there is any other 'fiber' in product name
  let allTx: any[] = [];
  from = 0;
  while(true) {
    const { data: tx } = await supabase.from('docs_inventory_transactions').select('product_id, data').range(from, from + limit - 1);
    if (!tx || tx.length === 0) break;
    allTx = allTx.concat(tx);
    from += limit;
  }
  
  const fiberTxProducts = new Set<string>();
  allTx.forEach(t => {
     const name = (t.data?.productName || '').toLowerCase();
     if (name.includes('fiber')) {
        fiberTxProducts.add(t.data?.productName || t.data?.productId);
     }
  });

  console.log('Other Fiber products in inventory tx:');
  console.log(Array.from(fiberTxProducts));
}
run();
