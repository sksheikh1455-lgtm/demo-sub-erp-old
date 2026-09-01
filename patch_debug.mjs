import fs from 'fs';
const path = 'store/useAccountingStore.ts';
let code = fs.readFileSync(path, 'utf8');

const oldCode = `        // We already built stockLevels purely from movementsAll correctly`;
const newCode = `        // We already built stockLevels purely from movementsAll correctly
        if (p.sku === 'SKU-THAT-HAS-ERROR' || p.name.includes('test')) {
            console.log("Product mapping:", { id: p.id, name: p.name, activeCids, finalStockLevels, qty });
        }
`;

if (code.includes(oldCode)) {
  code = code.split(oldCode).join(newCode);
  fs.writeFileSync(path, code);
  console.log("Patched store stock logic with debug");
} else {
  console.log("Could not find the code to patch");
}
