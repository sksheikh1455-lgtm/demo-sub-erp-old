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
      
      // Attempt to sync docs_user_company_access
      try {
         const { data: userData } = await supabase.from('docs_users').select('user_uuid').eq('id', id).maybeSingle();
         if (userData?.user_uuid) {
             const accessPayload = (updates.companyIds || []).map((cid: string) => ({
                 user_uuid: userData.user_uuid,
                 company_id: cid,
                 role_id: updates.roleId || 'role-accountant'
             }));
             await supabase.from('docs_user_company_access').delete().eq('user_uuid', userData.user_uuid);
             if (accessPayload.length > 0) {
                 await supabase.from('docs_user_company_access').upsert(accessPayload);
             }
         }
      } catch(e) {
         console.warn("Could not sync user company access, relies on next login:", e);
      }

      setLocalOnlyUsers((prev: any[]) => prev.map(u => u.id === id ? { ...u, ...updates } : u));
      return { id, ...updates };
    } catch(err) {
      console.error(err);
      throw err;
    }
  }, [setLocalOnlyUsers]);`;

content = content.replace(
  /const updateUser = useCallback\(async \(id: string, updates: any\) => \{[\s\S]*?\}, \[setLocalOnlyUsers\]\);/,
  updateStr
);

fs.writeFileSync('store/useAccountingStore.ts', content);
