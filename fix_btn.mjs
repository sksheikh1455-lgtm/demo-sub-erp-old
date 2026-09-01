import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /<button[\s\S]*?FORCE COPY PRODUCTS TO SUBORNO NEW[\s\S]*?<\/button>/;

const newButtonCode = `
        <button 
          onClick={async () => {
             try {
                alert('কপি শুরু হচ্ছে, দয়া করে অপেক্ষা করুন...');
                
                const { data: cData } = await supabase.from('docs_companies').select('*');
                const companies = cData || [];
                const sourceComp = companies.find((c) => c.data?.name === 'SUBORNO ELECTRIC' || c.id === 'comp-1');
                const targetComp = companies.find((c) => c.data?.name === 'SUBORNO NEW');
                
                if (!sourceComp || !targetComp) return alert('কম্পানি পাওয়া যায়নি!');

                // Fetch Source Brands
                let sourceBrands = [];
                let { data: sb } = await supabase.from('docs_brands').select('*').eq('company_id', sourceComp.id);
                if (sb) sourceBrands = sb;

                // Fetch Source Categories
                let sourceCats = [];
                let { data: sc } = await supabase.from('docs_categories').select('*').eq('company_id', sourceComp.id);
                if (sc) sourceCats = sc;

                // Fetch ALL Source Products
                let sourceProducts = [];
                let page = 0;
                let limit = 1000;
                let hasMore = true;
                
                while (hasMore) {
                   const { data: sp, error: sperr } = await supabase.from('docs_products')
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

                if (!sourceProducts || sourceProducts.length === 0) {
                  return alert("No products to copy!");
                }

                const brandMap = {};
                const catMap = {};

                const newBrands = sourceBrands.map((b) => {
                   const newId = crypto.randomUUID();
                   brandMap[b.id] = newId;
                   const newData = { ...b.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
                   return { id: newId, data: newData, company_id: targetComp.id, updated_at: new Date().toISOString() };
                });

                const newCats = sourceCats.map((c) => {
                   const newId = crypto.randomUUID();
                   catMap[c.id] = newId;
                   const newData = { ...c.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
                   return { id: newId, data: newData, company_id: targetComp.id, updated_at: new Date().toISOString() };
                });

                // Clear target
                await supabase.from('docs_brands').delete().eq('company_id', targetComp.id);
                await supabase.from('docs_categories').delete().eq('company_id', targetComp.id);
                await supabase.from('docs_products').delete().eq('company_id', targetComp.id);

                const newProducts = sourceProducts.map((p) => {
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

                if (newBrands.length > 0) await supabase.from('docs_brands').upsert(newBrands);
                if (newCats.length > 0) await supabase.from('docs_categories').upsert(newCats);
                
                for (let i = 0; i < newProducts.length; i += 500) {
                   await supabase.from('docs_products').upsert(newProducts.slice(i, i + 500));
                }

                alert('সফলভাবে ' + newProducts.length + ' টি প্রোডাক্ট কপি করা হয়েছে! দয়া করে পেজটি রিফ্রেশ করুন।');
             } catch(e) {
                alert('Error: ' + e.message);
             }
          }}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg shadow-lg font-bold w-full md:w-auto"
        >
          FORCE COPY PRODUCTS TO SUBORNO NEW
        </button>`;

content = content.replace(regex, newButtonCode);
fs.writeFileSync(path, content);
console.log('Fixed button logic!');
