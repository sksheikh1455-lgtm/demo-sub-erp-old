import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  let allInvoices: any[] = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    const { data: invoices } = await supabase.from('docs_invoices').select('id, data').range(from, from + limit - 1);
    if (!invoices || invoices.length === 0) break;
    allInvoices = allInvoices.concat(invoices);
    from += limit;
  }
  
  console.log('Total Invoices:', allInvoices.length);
  
  let soldQuantity = 0;
  allInvoices.forEach(inv => {
    const items = inv.data?.items || [];
    items.forEach((item: any) => {
      if (item.productId === '244000e6-c9aa-4737-9364-6b7135f030cb') {
        soldQuantity += Number(item.quantity) || 0;
      }
    });
  });
  console.log('Total Sold:', soldQuantity);
}
run();
