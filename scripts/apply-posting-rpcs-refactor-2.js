import fs from 'fs';

const filePath = 'store/useAccountingStore.ts';
let code = fs.readFileSync(filePath, 'utf8');

// Replace `fetchData();` with `if (currentUser?.id) fetchInitialData(currentUser.id);`
// AND fix dependency arrays!

code = code.replace(/fetchData\(\);/g, "if (currentUser?.id) fetchInitialData(currentUser.id);");
code = code.replace(/\[fetchData\]/g, "[currentUser, fetchInitialData]");
code = code.replace(/\[allPayments, activeCompanyIds, fetchData\]/g, "[allPayments, activeCompanyIds, currentUser, fetchInitialData]");
code = code.replace(/\[activeCompanyIds, fetchData\]/g, "[activeCompanyIds, currentUser, fetchInitialData]");

fs.writeFileSync(filePath, code);
console.log('Fixed undefined fetchData -> fetchInitialData');
