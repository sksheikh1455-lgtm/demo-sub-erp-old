import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const replaceStr = `    updateUser: async (id: string, updates: any) => {
    try {
      const state = get();
      const assignedCompanies = state.companies.filter(c => updates.companyIds?.includes(c.id));
      
      const payload = {
        name: updates.name,
        username: updates.username,
        email: updates.email,
        pin: updates.pin,
        role_id: updates.roleId,
        company_ids: updates.companyIds,
        company_id: updates.companyIds?.[0] || 'comp-1',
        data: {
            ...updates,
            allowedCompanies: assignedCompanies
        }
      };
      await dbService.updateDoc('docs_users', id, payload);`;

content = content.replace(
  /    updateUser: async \(id: string, updates: any\) => \{\n    try \{\n      const payload = \{\n        name: updates.name,\n        username: updates.username,\n        email: updates.email,\n        pin: updates.pin,\n        role_id: updates.roleId,\n        company_ids: updates.companyIds,\n        company_id: updates.companyIds\?\.\[0\] \|\| 'comp-1',\n        data: updates\n      \};\n      await dbService.updateDoc\('docs_users', id, payload\);/,
  replaceStr
);

fs.writeFileSync('store/useAccountingStore.ts', content);
