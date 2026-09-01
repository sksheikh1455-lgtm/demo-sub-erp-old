import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: contacts } = await supabase.from('docs_contacts').select('id, name, type').ilike('name', '%fiber%');
  console.log('Contacts:', contacts);

  if (contacts && contacts.length > 0) {
    const contactId = contacts[0].id;
    // How is vendor linked to products?
    // In many inventory systems, product has preferred_vendor_id or similar.
    const { data: products } = await supabase.from('docs_products').select('*');
    
    // Filter products where preferred vendor is this one, or just check the schema of docs_products
    const vendorProducts = products?.filter(p => 
      p.preferred_vendor_id === contactId || 
      (p.data && p.data.preferredVendorId === contactId)
    ) || [];

    console.log(`Products for ${contacts[0].name}:`, vendorProducts.length);
    let totalValue = 0;
    const list = vendorProducts.map(p => {
      const qoh = p.quantity_on_hand || (p.data && p.data.quantityOnHand) || 0;
      const cost = p.cost_price || p.initial_cost || (p.data && (p.data.costPrice || p.data.initialCost)) || 0;
      const value = qoh * cost;
      totalValue += value;
      return { name: p.name, sku: p.sku || p.data?.sku, qoh, cost, value };
    });
    console.log('List:', list);
    console.log('Total Value:', totalValue);
  }
}
run();
