import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: companies, error: cErr } = await supabase.from('docs_companies').select('*');
  if (cErr) return console.error("Err fetching companies:", cErr);
  
  const sourceComp = companies.find(c => c.data?.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1');
  const targetComp = companies.find(c => c.data?.name === 'SUBORNO NEW');

  if (!sourceComp || !targetComp) {
     return console.log("Missing companies");
  }

  console.log(`Source: ${sourceComp.data?.name} (${sourceComp.id})`);
  console.log(`Target: ${targetComp.data?.name} (${targetComp.id})`);

  // Fetch Brands
  const { data: sourceBrands } = await supabase.from('docs_brands').select('*').eq('company_id', sourceComp.id);
  
  // Fetch Cats
  const { data: sourceCats } = await supabase.from('docs_categories').select('*').eq('company_id', sourceComp.id);

  // Fetch Products (all)
  let sourceProducts = [];
  let page = 0;
  let limit = 1000;
  let hasMore = true;
  while(hasMore) {
     const { data: sp } = await supabase.from('docs_products')
        .select('*')
        .eq('company_id', sourceComp.id)
        .range(page * limit, (page + 1) * limit - 1);
     if (sp && sp.length > 0) {
        sourceProducts.push(...sp);
        page++;
        if (sp.length < limit) hasMore = false;
     } else {
        hasMore = false;
     }
  }

  console.log(`Found ${sourceBrands?.length || 0} brands, ${sourceCats?.length || 0} cats, ${sourceProducts?.length || 0} products in source.`);

  // Clear target
  console.log("Clearing existing target data...");
  await supabase.from('docs_brands').delete().eq('company_id', targetComp.id);
  await supabase.from('docs_categories').delete().eq('company_id', targetComp.id);
  await supabase.from('docs_products').delete().eq('company_id', targetComp.id);

  const brandMap = {};
  const catMap = {};

  const newBrands = (sourceBrands || []).map(b => {
     const newId = crypto.randomUUID();
     brandMap[b.id] = newId;
     const newData = { ...b.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
     return { id: newId, data: newData, company_id: targetComp.id, updated_at: new Date().toISOString() };
  });

  const newCats = (sourceCats || []).map(c => {
     const newId = crypto.randomUUID();
     catMap[c.id] = newId;
     const newData = { ...c.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
     return { id: newId, data: newData, company_id: targetComp.id, updated_at: new Date().toISOString() };
  });

  const newProducts = sourceProducts.map(p => {
     const newId = crypto.randomUUID();
     const d = p.data || {};
     const newData = { 
         ...d, 
         id: newId, 
         companyId: targetComp.id, 
         companyIds: [targetComp.id],
         brandId: brandMap[d.brandId] || d.brandId,
         categoryId: catMap[d.categoryId] || d.categoryId,
         stock: 0, openingStock: 0, quantity: 0, quantityOnHand: 0, openingBalance: 0, balance: 0,
         stockLevels: { [targetComp.id]: 0 },
         initialStockLevels: { [targetComp.id]: 0 }
     };
     delete newData.company_id;
     delete newData.company_ids;

     return { id: newId, data: newData, company_id: targetComp.id, updated_at: new Date().toISOString() };
  });

  if (newBrands.length > 0) {
     const {error} = await supabase.from('docs_brands').upsert(newBrands);
     if (error) console.error("Brand upsert err:", error);
  }
  if (newCats.length > 0) {
     const {error} = await supabase.from('docs_categories').upsert(newCats);
     if (error) console.error("Cat upsert err:", error);
  }

  for (let i = 0; i < newProducts.length; i += 500) {
     const {error} = await supabase.from('docs_products').upsert(newProducts.slice(i, i + 500));
     if (error) console.error("Prod upsert err:", error);
  }

  console.log(`Success! Inserted ${newProducts.length} products.`);
}
run();
