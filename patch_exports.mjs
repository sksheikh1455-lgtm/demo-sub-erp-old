import fs from 'fs';
const path = 'store/useAccountingStore.ts';
let code = fs.readFileSync(path, 'utf8');

const oldExport = `    getGeneralLedgerByCode,
    paginatedProducts,
    setPaginatedProducts,`;

const newExport = `    getGeneralLedgerByCode,
    paginatedProducts: resolvedPaginatedProducts,
    setPaginatedProducts,`;

if (code.includes(oldExport)) {
  code = code.split(oldExport).join(newExport);
  fs.writeFileSync(path, code);
  console.log("Patched export logic");
} else {
  console.log("Could not find the code to patch");
}
