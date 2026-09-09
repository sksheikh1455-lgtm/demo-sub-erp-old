import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const replacement = "const activeCids = useAccountingStoreBase.getState().activeCompanyIds;";
const target = `const activeCids = useAccountingStoreBase.getState().activeCompanyIds;
      // TEMPORARY CLEANUP FOR PRODUCT (Runs silently in background)
      supabase.from('docs_products').delete().ilike('name', '%Cancel-RR%').then((r) => console.log('Cleanup product:', r));
      supabase.from('docs_products').delete().eq('sku', '1476RRTT').then((r) => console.log('Cleanup sku:', r));`;

if (content.includes("TEMPORARY CLEANUP FOR PRODUCT")) {
  content = content.replace(target, replacement);
  fs.writeFileSync('store/useAccountingStore.ts', content);
  console.log("Reverted successfully");
} else {
  console.log("Already reverted or not found");
}
