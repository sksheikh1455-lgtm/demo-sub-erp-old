import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  const { data, error } = await supabase.from('erp_state').select('data').eq('id', 'singleton').maybeSingle();
  if (error || !data) {
     console.error("Error or no data.", error);
     return;
  }
  
  const state = data.data;
  console.log("Migrating items...");
  
  if (state.allProducts && state.allProducts.length > 0) {
     const docs = state.allProducts.map(p => ({ id: p.id, data: p }));
     console.log(`Migrating ${docs.length} products...`);
     await supabase.from('docs_products').upsert(docs);
  }
  
  if (state.allContacts && state.allContacts.length > 0) {
     const docs = state.allContacts.map(p => ({ id: p.id, data: p }));
     console.log(`Migrating ${docs.length} contacts...`);
     await supabase.from('docs_contacts').upsert(docs);
  }
  
  if (state.allInvoices && state.allInvoices.length > 0) {
     const docs = state.allInvoices.map(p => ({ id: p.id, data: p }));
     console.log(`Migrating ${docs.length} invoices...`);
     await supabase.from('docs_invoices').upsert(docs);
  }
  
  if (state.allEntries && state.allEntries.length > 0) {
     const docs = state.allEntries.map(p => ({ id: p.id, data: p }));
     console.log(`Migrating ${docs.length} journals...`);
     await supabase.from('docs_journals').upsert(docs);
  }
  
  console.log("Migration finished.");
}

migrate();
