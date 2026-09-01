const fs = require('fs');
let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');
code = code.replace(
  "      if (error) {\n        console.error('Failed to sync updated product to Supabase:', error);\n      }",
  "      if (error) {\n        console.error('Failed to sync updated product to Supabase:', error);\n        throw error;\n      }"
);
fs.writeFileSync('store/useAccountingStore.ts', code);
