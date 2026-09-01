import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// For auto migration
content = content.replace(/await supabase.from\('docs_products'\).upsert\(newProducts.slice\(i, i \+ 500\)\);/g, 
`const { error: err } = await supabase.from('docs_products').upsert(newProducts.slice(i, i + 500));
if (err) throw new Error("DB Error: " + err.message);`);

fs.writeFileSync(path, content);
console.log("Fixed upsert error handling");
