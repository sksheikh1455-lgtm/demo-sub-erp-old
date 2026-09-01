import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: bills } = await supabase.from('docs_bills').select('id, data, contact_id');
  if (!bills) return;
  
  const { data: contacts } = await supabase.from('docs_contacts').select('id, name').ilike('name', '%fiber%');
  console.log('Fiber contacts:', contacts);
  
  const fiberIds = contacts?.map(c => c.id) || [];
  
  const fiberBills = bills.filter(b => {
     const cid = b.contact_id || b.data?.contactId;
     return fiberIds.includes(cid);
  });
  
  console.log('Fiber bills count:', fiberBills.length);
  
  const productIds = new Set<string>();
  const billItems: any[] = [];
  fiberBills.forEach(b => {
    const items = b.data?.items || [];
    items.forEach((item: any) => {
       if (item.name || item.productId) {
         billItems.push(item);
         if (item.productId) productIds.add(item.productId);
       }
    });
  });
  
  console.log('Bill Items:', billItems);
}
run();
