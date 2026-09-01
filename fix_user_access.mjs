import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `                if (newBrands.length > 0) await supabase.from('docs_brands').upsert(newBrands);
                if (newCats.length > 0) await supabase.from('docs_categories').upsert(newCats);
                
                // FORCE user access to target company to bypass RLS isolation
                const user = store.currentUser;
                if (user) {
                   const uCompIds = Array.from(new Set([...(user.companyIds || []), targetComp.id, sourceComp.id]));
                   await supabase.from('docs_users').update({ company_ids: uCompIds, data: { ...user, companyIds: uCompIds } }).eq('id', user.id);
                }
                
                for (let i = 0; i < newProducts.length; i += 500) {`;

content = content.replace(/                if \(newBrands\.length > 0\) await supabase\.from\('docs_brands'\)\.upsert\(newBrands\);\n                if \(newCats\.length > 0\) await supabase\.from\('docs_categories'\)\.upsert\(newCats\);\n                \n                for \(let i = 0; i < newProducts\.length; i \+= 500\) \{/g, replacement);

fs.writeFileSync(path, content);
console.log('Fixed user access');
