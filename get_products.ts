import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: user, error: e1 } = await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: contacts } = await supabase.from('docs_contacts').select('id, name, type').ilike('name', '%fiber%');
  console.log('Contacts:', contacts);
  if (!contacts || contacts.length === 0) return;
  const vendorId = contacts[0].id;

  const { data: products } = await supabase.from('docs_products').select('id, name, quantity_on_hand, cost_price, data');
  if (products) {
    const matching = products.filter(p => {
      const d = p.data;
      if (d && JSON.stringify(d).includes(vendorId)) return true;
      if (p.name.toLowerCase().includes('fiber')) return true;
      return false;
    });
    console.log('Matching Products:', matching.length);
    console.log(matching);
  }
}
run();
