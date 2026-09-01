import fs from 'fs';
const path = 'store/useAccountingStore.ts';
let code = fs.readFileSync(path, 'utf8');

const oldCode = `const { data: latestProds } = await supabase.from('docs_products').select('*').in('company_id', [companyId]);`;
const newCode = `const { data: latestProds } = await supabase.from('docs_products').select('*').or(\`company_id.eq."\${companyId}",company_ids.cs.["\${companyId}"],company_ids.ov.{\${companyId}}\`);`;

if (code.includes(oldCode)) {
  code = code.split(oldCode).join(newCode);
  fs.writeFileSync(path, code);
  console.log("Patched useAccountingStore.ts");
} else {
  console.log("Could not find code to patch in useAccountingStore.ts");
}
