import fs from 'fs';
let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const updateStr = `  const updateUser = useCallback(async (id: string, updates: any) => {
    try {
      const payload = {
        name: updates.name,
        username: updates.username,
        email: updates.email,
        pin: updates.pin,
        role_id: updates.roleId,
        company_ids: updates.companyIds,
        company_id: updates.companyIds?.[0] || 'comp-1',
        data: updates
      };
      await dbService.updateDoc('docs_users', id, payload);
      setLocalOnlyUsers((prev: any[]) => prev.map(u => u.id === id ? { ...u, ...updates } : u));
      return { id, ...updates };
    } catch(err) {
      console.error(err);
      throw err;
    }
  }, [setLocalOnlyUsers]);`;

const inviteStr = `  const inviteUser = useCallback(async (userData: any) => {
    try {
      const id = 'user-' + Date.now();
      const payload = {
        id,
        name: userData.name,
        username: userData.username,
        email: userData.email,
        pin: userData.pin || '1234',
        role_id: userData.roleId,
        company_ids: userData.companyIds,
        company_id: userData.companyIds?.[0] || 'comp-1',
        status: 'ACTIVE',
        data: userData
      };
      await dbService.upsertDoc('docs_users', id, payload);
      const newUser = { id, ...userData };
      setLocalOnlyUsers((prev: any[]) => [newUser, ...prev]);
      return newUser;
    } catch(err) {
      console.error(err);
      throw err;
    }
  }, [setLocalOnlyUsers]);`;

content = content.replace(
  /const updateUser = useCallback\(async \(\.\.\.args: any\[\]\) => \{ console\.warn\('Stubbed method updateUser called'\); return \{\} as any; \}, \[\]\);/,
  updateStr
);

content = content.replace(
  /const inviteUser = useCallback\(async \(\.\.\.args: any\[\]\) => \{ console\.warn\('Stubbed method inviteUser called'\); return \{\} as any; \}, \[\]\);/,
  inviteStr
);

fs.writeFileSync('store/useAccountingStore.ts', content);
