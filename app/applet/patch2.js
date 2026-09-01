const fs = require('fs');

let db = fs.readFileSync('services/db.ts', 'utf-8');
db = db.replace(
  'const terms = sEscaped.split(/\\s+/).filter(Boolean);',
  'let terms = sEscaped.split(/\\s+/).filter(Boolean);\n        if (terms.length > 5 || sEscaped.length > 50) terms = [sEscaped];'
);
fs.writeFileSync('services/db.ts', db, 'utf-8');
console.log('Patched services/db.ts');

let store = fs.readFileSync('store/useAccountingStore.ts', 'utf-8');
store = store.replaceAll(
  'const terms = query.trim().split(/\\s+/).filter(Boolean);',
  'let terms = query.trim().split(/\\s+/).filter(Boolean);\n        if (terms.length > 5 || query.trim().length > 50) terms = [query.trim()];'
);
fs.writeFileSync('store/useAccountingStore.ts', store, 'utf-8');
console.log('Patched store/useAccountingStore.ts');
