import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/sku: newData\.sku \|\| '',/g, "sku: newData.sku ? newData.sku + '-' + newId.substring(0, 4) : 'SKU-' + newId.substring(0, 8),");

fs.writeFileSync(path, content);
console.log('Fixed SKU uniqueness');
