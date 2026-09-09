import fs from 'fs';
let content = fs.readFileSync('store/useAuthSlice.ts', 'utf8');

content = content.replace(
/            \/\/ Ensure data JSON column is populated for backward compatibility[\s\S]*?\}\)\.eq\('id', profileData\.id\);\n            \}/g,
`            // Removed data update since data column does not exist`
);

fs.writeFileSync('store/useAuthSlice.ts', content);
