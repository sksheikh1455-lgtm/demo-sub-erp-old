import fs from 'fs';

let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

// 1. Remove syncDocChanges bulk hydration inside useDocumentState
code = code.replace(
  /if \(upserts\.length > 0 \|\| deletes\.length > 0\) \{\s*syncDocChanges\(table, upserts, deletes\);\s*\}/g,
  `if (upserts.length > 0 || deletes.length > 0) {
          // Phase 3: Bulk hydration syncDocChanges removed completely
        }`
);

// We need to completely remove calculateProductInventory body and replace it.
const calcStart = code.indexOf('function calculateProductInventory(');
const calcEndStr = 'const deleteProducts = useCallback(';
const calcEnd = code.indexOf(calcEndStr);

if (calcStart > -1 && calcEnd > -1) {
  const newText = `function calculateProductInventory(
    productId: string, billsToUse: any[], invoicesToUse: any[], adjustmentsToUse: any[], creditNotesToUse: any[], products: any[], companyId?: string, _excludeBillId?: string 
  ) {
    const product = products.find((p: any) => p.id === productId);
    if (!product) return { qty: 0, wac: 0 };
    return {
      qty: companyId ? (product.stockLevels?.[companyId] || 0) : (product.quantityOnHand || 0),
      wac: product.costPrice || 0
    };
  }

  const recalculateProductInventory = useCallback((productId: string) => {
    // Phase 3: No-op. The backend manages it. We just trigger a refetch if needed.
  }, []);

  `;
  code = code.substring(0, calcStart) + newText + code.substring(calcEnd);
}

fs.writeFileSync('store/useAccountingStore.ts', code);
