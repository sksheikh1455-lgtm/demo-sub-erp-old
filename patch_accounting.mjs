import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

content = content.replace(
/            \/\/ CRITICAL: Ensure data JSON column is populated to bypass RLS failure in check_company_access[\s\S]*?\}\)\.eq\('id', profileData\.id\);\n            \}/g,
`            // Removed data column update since column does not exist`
);

fs.writeFileSync('store/useAccountingStore.ts', content);
