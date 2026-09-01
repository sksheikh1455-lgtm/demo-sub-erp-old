import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const buttonJSX = `
      {/* MIGRATION TOOL */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 mb-8">
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-4">Share Products across Companies</h3>
        {copyStatus && <div className="mb-4 p-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs">{copyStatus}</div>}
        <button 
          onClick={async () => {
             try {
                setCopyStatus('প্রোডাক্ট শেয়ার করা হচ্ছে, দয়া করে অপেক্ষা করুন...');
                const companies = store.companies || [];
                const sourceComp = companies.find(c => c.name?.toLowerCase() === 'suborno electric' || c.id === 'comp-1');
                const targetComp = companies.find(c => c.name?.toLowerCase() === 'suborno new');
                
                if (!sourceComp || !targetComp) {
                  setCopyStatus('কোম্পানি পাওয়া যায়নি!');
                  return;
                }

                // 1. Give user access to target company
                const user = store.currentUser;
                if (user) {
                   const uCompIds = Array.from(new Set([...(user.companyIds || []), targetComp.id, sourceComp.id]));
                   await supabase.from('docs_users').update({ company_ids: uCompIds, data: { ...user, companyIds: uCompIds } }).eq('id', user.id);
                }

                // 2. Fetch all products of source company
                let sourceProducts = [];
                let page = 0;
                let limit = 1000;
                let hasMore = true;
                
                while (hasMore) {
                   const { data: sp, error } = await supabase.from('docs_products')
                      .select('id, company_ids, data')
                      .range(page * limit, (page + 1) * limit - 1);
                   
                   if (error) throw error;
                   
                   if (sp && sp.length > 0) {
                      const filtered = sp.filter(p => p.company_ids?.includes(sourceComp.id) || p.data?.companyIds?.includes(sourceComp.id) || p.data?.companyId === sourceComp.id);
                      sourceProducts.push(...filtered);
                      page++;
                      if (sp.length < limit) hasMore = false;
                   } else {
                      hasMore = false;
                   }
                }

                if (sourceProducts.length === 0) {
                  setCopyStatus("কোনো প্রোডাক্ট পাওয়া যায়নি!");
                  return;
                }

                // 3. Update existing products to include target company ID
                const toUpdate = sourceProducts.map(p => {
                   const arr = Array.from(new Set([...(p.company_ids || []), targetComp.id]));
                   const newData = { ...(p.data || {}), companyIds: arr };
                   return {
                      id: p.id,
                      company_ids: arr,
                      data: newData
                   };
                });

                for (let i = 0; i < toUpdate.length; i += 500) {
                   const chunk = toUpdate.slice(i, i + 500);
                   const { error: err } = await supabase.from('docs_products').upsert(chunk, { onConflict: 'id' });
                   if (err) throw new Error("DB Error during Upsert: " + err.message);
                }
                
                setCopyStatus('সফলভাবে ' + sourceProducts.length + ' টি প্রোডাক্ট Suborno New কোম্পানিতে যোগ করা হয়েছে!');
                setTimeout(() => window.location.reload(), 2000);
             } catch(e) {
                setCopyStatus('Error: ' + e.message);
             }
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-lg font-bold w-full md:w-auto transition-all uppercase tracking-widest text-xs"
        >
          Share Products to Suborno New
        </button>
      </div>
`;

// Insert it right after `<div className="space-y-8 animate-in fade-in duration-700">`
content = content.replace(/<div className="space-y-8 animate-in fade-in duration-700">/, '<div className="space-y-8 animate-in fade-in duration-700">\n' + buttonJSX);
fs.writeFileSync(path, content);
console.log('Added Share button');
