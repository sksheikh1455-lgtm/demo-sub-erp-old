import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf8');

content = content.replace(
/                   await supabase\.from\('docs_users'\)\.update\(\{ company_ids: uCompIds, data: \{ \.\.\.user, companyIds: uCompIds \} \}\)\.eq\('id', user\.id\);/g,
`                   await supabase.from('docs_users').update({ company_ids: uCompIds }).eq('id', user.id);`
);

fs.writeFileSync('components/Dashboard.tsx', content);
