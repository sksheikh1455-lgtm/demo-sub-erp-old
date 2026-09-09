import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

content = content.replace(
/               await supabase\.from\('docs_users'\)\.update\(\{\n                 company_ids: newIds,\n                 data: \{\n                   \.\.\.\(profile\.data \|\| \{\}\),\n                   companyIds: newIds\n                 \}\n               \}\)\.eq\('id', profile\.id\);/g,
`               await supabase.from('docs_users').update({
                 company_ids: newIds
               }).eq('id', profile.id);`
);

fs.writeFileSync('store/useAccountingStore.ts', content);
