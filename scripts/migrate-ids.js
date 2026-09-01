import fs from 'fs';

let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

// replace serial numbers based on Date.now()
content = content.replace(/\`\$\{newProduct\.sku \|\| 'SN'\}\-\$\{Date\.now\(\)\}-\$\{i\}\`/g, "generateUUID()");
content = content.replace(/\`\$\{updates\.sku \|\| product\.sku \|\| 'SN'\}\-\$\{Date\.now\(\)\}-\$\{i\}\`/g, "generateUUID()");

// replace regex that did not match for Math.random()
content = content.replace(/`([A-Za-z0-9_-]+)-\$\{([A-Za-z0-9_-]+)\}-\$\{Math\.random\(\)\.toString\(36\)\.substr\([0-9,\s]+\)\}`/g, "generateUUID()");
content = content.replace(/`JE-INIT-\$\{timestamp\}-\$\{idx\}-\$\{Math\.floor\(Math\.random\(\) \* 1000000\)\}`/g, "generateUUID()");

fs.writeFileSync('store/useAccountingStore.ts', content);
console.log('ID migrations complete.');
