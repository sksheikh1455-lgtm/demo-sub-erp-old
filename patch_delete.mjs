import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const target = "const activeCids = useAccountingStoreBase.getState().activeCompanyIds;";
const replacement = `const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
      // TEMPORARY CLEANUP FOR PRODUCT (Runs silently in background)
      supabase.from('docs_products').delete().ilike('name', '%Cancel-RR%').then((r) => console.log('Cleanup product:', r));
      supabase.from('docs_products').delete().eq('sku', '1476RRTT').then((r) => console.log('Cleanup sku:', r));`;

if (content.includes(target) && !content.includes("TEMPORARY CLEANUP FOR PRODUCT")) {
  // replace first occurrence
  content = content.replace(target, replacement);
  fs.writeFileSync('store/useAccountingStore.ts', content);
  console.log("Patched successfully");
} else {
  console.log("Could not find target or already patched");
}
