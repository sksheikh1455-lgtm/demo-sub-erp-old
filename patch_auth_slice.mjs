import fs from 'fs';
let content = fs.readFileSync('store/useAuthSlice.ts', 'utf8');

// We will remove the update that attempts to write to data column
content = content.replace(
/      \/\/ Ensure data JSON column is populated for backward compatibility[\s\S]*?\.eq\('id', profileData\.id\);\n         profileData\.data = \{\n           \.\.\.\(profileData\.data \|\| \{\}\),\n           companyId: profileData\.company_id \|\| 'comp-1',\n           companyIds: profileData\.company_ids \|\| \['comp-1'\],\n           roleId: profileData\.role_id \|\| 'role-accountant'\n         \};\n      \}/g,
`      // No longer updating data column since it doesn't exist
      profileData.data = {
         companyId: profileData.company_id || 'comp-1',
         companyIds: profileData.company_ids || ['comp-1'],
         roleId: profileData.role_id || 'role-accountant'
      };`
);

fs.writeFileSync('store/useAuthSlice.ts', content);
