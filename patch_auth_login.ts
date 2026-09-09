import fs from 'fs';
let content = fs.readFileSync('store/useAuthSlice.ts', 'utf8');

const loginStr = `      if (!profileData) {
        throw new Error('User profile not found.');
      }

      // ALWAYS sync docs_user_company_access on login to ensure RLS doesn't block access
      try {
         const accessPayload = (profileData.company_ids || []).map((cid: string) => ({
           user_uuid: authData.user.id,
           company_id: cid,
           role_id: profileData.role_id || 'role-accountant'
         }));
         if (accessPayload.length > 0) {
           await supabase.from('docs_user_company_access').delete().eq('user_uuid', authData.user.id);
           await supabase.from('docs_user_company_access').upsert(accessPayload);
         }
      } catch(e) {
         console.warn("Could not sync user company access on login:", e);
      }

      const userProfile = {`;

content = content.replace(
  /      if \(\!profileData\) \{\n        throw new Error\('User profile not found.'\);\n      \}\n\n      const userProfile = \{/,
  loginStr
);

fs.writeFileSync('store/useAuthSlice.ts', content);
