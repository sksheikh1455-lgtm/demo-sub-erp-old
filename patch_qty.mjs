import fs from 'fs';
const path = 'store/useAccountingStore.ts';
let code = fs.readFileSync(path, 'utf8');

const regex = /let qty = dbQty !== undefined \? dbQty : calculatedQty;\s*const finalStockLevels = \(dbStockLevels && Object\.keys\(dbStockLevels\)\.length > 0\) \? dbStockLevels : stockLevels;/;

const newCode = `const finalStockLevels = (dbStockLevels && Object.keys(dbStockLevels).length > 0) ? dbStockLevels : stockLevels;
        
        let qty = 0;
        if (finalStockLevels && Object.keys(finalStockLevels).length > 0) {
           qty = activeCids.reduce((sum, cid) => sum + (Number(finalStockLevels[cid]) || 0), 0);
        } else {
           const primaryCid = p.company_id || (p as any).companyId || p.companyIds?.[0];
           if (primaryCid && activeCids.includes(primaryCid)) {
               qty = dbQty !== undefined ? dbQty : calculatedQty;
           } else {
               qty = 0;
           }
        }`;

if (regex.test(code)) {
  code = code.replace(regex, newCode);
  fs.writeFileSync(path, code);
  console.log("Patched store stock logic with REGEX");
} else {
  console.log("Could not find the code to patch");
}
