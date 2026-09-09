import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const targetStr = `      const loadedCompanies = unwrap(results[7]);
      const loadedAccounts = unwrap(results[10]) || [];
      if(loadedCompanies !== undefined) {
        const comp1 = loadedCompanies.find((c: any) => c.id === 'comp-1');
        if (comp1 && comp1.name === 'Default Company') {
          comp1.name = 'SUBORNO ELECTRIC';
          comp1.code = 'SUL';
        }`;

const replaceStr = `      const loadedCompanies = unwrap(results[7]);
      const loadedAccounts = unwrap(results[10]) || [];
      if(loadedCompanies !== undefined) {
        const comp1 = loadedCompanies.find((c: any) => c.id === 'comp-1');
        if (comp1 && comp1.name === 'Default Company') {
          comp1.name = 'SUBORNO ELECTRIC';
          comp1.code = 'SUL';
        }

        const userState = useAccountingStoreBase.getState();
        const currentUser = userState.currentUser;
        if (currentUser && currentUser.companyIds) {
           currentUser.companyIds.forEach(cid => {
              if (!loadedCompanies.find(c => c.id === cid)) {
                 loadedCompanies.push({
                    id: cid,
                    name: cid === 'comp-1' ? 'SUBORNO ELECTRIC' : cid === 'comp-1740059535071' ? 'SUBORNO NEW' : 'Company ' + cid.substring(0, 4),
                    address: "Synced via local access",
                    phone: "",
                    email: "",
                    currency: "BDT",
                    fiscalYearStart: "Jan"
                 });
              }
           });
        }
        if (currentUser?.data?.allowedCompanies) {
           currentUser.data.allowedCompanies.forEach(ac => {
              const existingIdx = loadedCompanies.findIndex(c => c.id === ac.id);
              if (existingIdx >= 0) loadedCompanies[existingIdx] = ac;
              else loadedCompanies.push(ac);
           });
        }`;

content = content.replace(targetStr, replaceStr);

fs.writeFileSync('store/useAccountingStore.ts', content);
