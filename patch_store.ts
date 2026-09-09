import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const replaceStr = `      let finalCompanies = results[0] as Company[];
      const rlsCompanyIds = finalCompanies.map(c => c.id);
      
      if (currentUserProfile?.company_ids) {
          currentUserProfile.company_ids.forEach((cid: string) => {
              if (!rlsCompanyIds.includes(cid)) {
                  // Create a stub company so the user can select it!
                  finalCompanies.push({
                      id: cid,
                      name: "Company " + cid.substring(0, 4) + " (Syncing...)",
                      address: "Please ask admin to re-save to sync name",
                      phone: "",
                      email: "",
                      currency: "BDT",
                      fiscalYearStart: "Jan"
                  } as Company);
              }
          });
      }
      
      // Also if admin saved allowedCompanies in data
      if (currentUserProfile?.data?.allowedCompanies) {
          currentUserProfile.data.allowedCompanies.forEach((ac: any) => {
              const existingIdx = finalCompanies.findIndex(c => c.id === ac.id);
              if (existingIdx >= 0) {
                  finalCompanies[existingIdx] = ac; // overwrite stub with real data
              } else {
                  finalCompanies.push(ac);
              }
          });
      }

      set({
        transactions: results[2] as Transaction[],
        invoices: results[3] as Invoice[],
        companies: finalCompanies,
        users: results[1] as User[],`;

content = content.replace(
  /      set\(\{\n        transactions: results\[2\] as Transaction\[\],\n        invoices: results\[3\] as Invoice\[\],\n        companies: results\[0\] as Company\[\],\n        users: results\[1\] as User\[\],/,
  replaceStr
);

fs.writeFileSync('store/useAccountingStore.ts', content);
