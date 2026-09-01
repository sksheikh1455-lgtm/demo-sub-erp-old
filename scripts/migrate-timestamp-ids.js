import fs from 'fs';

let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

content = content.replace(/\`P-\$\{timestamp\}-\$\{idx\}\`/g, "generateUUID()");
content = content.replace(/\`EXT-\$\{timestamp\}-\$\{idx\}\`/g, "generateUUID()");
content = content.replace(/\`P-IMP-\$\{timestamp\}-\$\{idx\}\`/g, "generateUUID()");
content = content.replace(/\`EXT-PROD-\$\{timestamp\}-\$\{idx\}\`/g, "generateUUID()");
content = content.replace(/\`CT-IMP-\$\{timestamp\}-\$\{idx\}\`/g, "generateUUID()");

fs.writeFileSync('store/useAccountingStore.ts', content);
console.log('Final ID updates complete.');
