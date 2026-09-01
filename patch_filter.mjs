import fs from 'fs';
const path = 'store/useAccountingStore.ts';
let code = fs.readFileSync(path, 'utf8');

const oldFilter = `        const pCompanyIds = Array.isArray(p?.companyIds) ? p?.companyIds : [];
        if (p?.companyId) {
          return activeCids.includes(p?.companyId);
        }
        return pCompanyIds.some((id: any) => activeCids.includes(id));`;

const newFilter = `        const pCompanyIds = Array.isArray(p?.companyIds) ? p?.companyIds : [];
        if (pCompanyIds.length > 0) {
            return pCompanyIds.some((id: any) => activeCids.includes(id));
        }
        if (p?.companyId) {
          return activeCids.includes(p?.companyId);
        }
        return true;`;

if (code.includes(oldFilter)) {
  code = code.split(oldFilter).join(newFilter);
  fs.writeFileSync(path, code);
  console.log("Patched filter logic in store");
} else {
  console.log("Could not find the code to patch");
}
