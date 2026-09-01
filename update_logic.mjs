import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /\/\/ Fetch ALL Source Products[\s\S]*?if \(err\) throw new Error\("DB Error: " \+ err\.message\);\n                \}/;

const newLogic = `// Add targetComp.id to existing brands
                const newBrands = sourceBrands.map(b => {
                   const arr = Array.from(new Set([...(b.company_ids || []), targetComp.id]));
                   return { ...b, company_ids: arr, data: { ...(b.data || {}), companyIds: arr } };
                });

                // Add targetComp.id to existing categories
                const newCats = sourceCats.map(c => {
                   const arr = Array.from(new Set([...(c.company_ids || []), targetComp.id]));
                   return { ...c, company_ids: arr, data: { ...(c.data || {}), companyIds: arr } };
                });

                // Fetch ALL Source Products
                let sourceProducts = [];
                let page = 0;
                let limit = 1000;
                let hasMore = true;
                
                while (hasMore) {
                   const { data: sp } = await supabase.from('docs_products').select('*').range(page * limit, (page + 1) * limit - 1);
                   if (sp && sp.length > 0) {
                      const filtered = sp.filter(p => p.company_id === sourceComp.id || p.data?.companyId === sourceComp.id || p.data?.companyIds?.includes(sourceComp.id));
                      sourceProducts.push(...filtered);
                      page++;
                      if (sp.length < limit) hasMore = false;
                   } else {
                      hasMore = false;
                   }
                }

                if (!sourceProducts || sourceProducts.length === 0) {
                  setCopyStatus("No products to copy!");
                  return;
                }

                const newProducts = sourceProducts.map(p => {
                   const arr = Array.from(new Set([...(p.company_ids || []), targetComp.id]));
                   const newData = { ...(p.data || {}), companyIds: arr };
                   // Initialize stock levels for new company
                   if (!newData.stockLevels) newData.stockLevels = {};
                   if (!newData.initialStockLevels) newData.initialStockLevels = {};
                   if (newData.stockLevels[targetComp.id] === undefined) newData.stockLevels[targetComp.id] = 0;
                   if (newData.initialStockLevels[targetComp.id] === undefined) newData.initialStockLevels[targetComp.id] = 0;

                   return { ...p, company_ids: arr, data: newData };
                });

                if (newBrands.length > 0) await supabase.from('docs_brands').upsert(newBrands);
                if (newCats.length > 0) await supabase.from('docs_categories').upsert(newCats);
                
                // FORCE user access to target company to bypass RLS isolation
                const user = store.currentUser;
                if (user) {
                   const uCompIds = Array.from(new Set([...(user.companyIds || []), targetComp.id, sourceComp.id]));
                   await supabase.from('docs_users').update({ company_ids: uCompIds, data: { ...user, companyIds: uCompIds } }).eq('id', user.id);
                }
                
                for (let i = 0; i < newProducts.length; i += 500) {
                   const { error: err } = await supabase.from('docs_products').upsert(newProducts.slice(i, i + 500));
                   if (err) throw new Error("DB Error: " + err.message);
                }`;

content = content.replace(regex, newLogic);
fs.writeFileSync(path, content);
console.log('Replaced logic to SHARE products instead of duplicating.');
