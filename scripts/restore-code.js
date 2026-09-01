import fs from 'fs';

let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const regex = /\n    \/\/ Synchronously update ref for same-event-loop validation.*\n    return newAccount;\n  \}, \[activeCompanyIds, allAccounts\]\);/s;

const missingCode = `
  const switchCompany = useCallback((companyId: string) => {
    setActiveCompanyIds([companyId]);
  }, []);

  const getAccountIdByCode = useCallback((code: string, targetCompanyId?: string) => {
    const companyId = targetCompanyId || activeCompanyIds[0];
    const accounts = allAccounts || [];
    
    // exact match for company
    const account = accounts.find(a => String(a.code || '') === String(code) && a.companyId === companyId);
    if (account) return account.id;

    // cross-company code fallback
    const globalFallback = accounts.find(a => String(a.code || '') === String(code));
    return globalFallback ? globalFallback.id : null;
  }, [allAccounts, activeCompanyIds]);

  const addAccount = useCallback((account: Omit<any, 'id' | 'companyId'>, targetCompanyId?: string) => {
    const companyId = targetCompanyId || activeCompanyIds[0];
    
    let code = account.code;
    if (!code) {
      const typePrefixes: Record<string, string> = {
        'ASSET': '1', 'LIABILITY': '2', 'EQUITY': '3', 'REVENUE': '4', 'EXPENSE': '5'
      };
      code = \`\${typePrefixes[account.type] || '9'}\${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}\`;
    }

    const newId = generateUUID();
    const newAccount = {
      ...account,
      id: newId,
      code,
      companyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setAllAccounts((prev: any) => [...prev, newAccount]);
    accountsRef.current = [...(accountsRef.current || []), newAccount];

    // Persist
    import('../supabase').then(({ supabase }) => {
      supabase.from('docs_accounts').upsert({
        id: newId,
        data: newAccount,
        company_id: companyId,
        name: newAccount.name || '',
        code: newAccount.code || ''
      }).catch(console.error);
    });

    return newAccount;
  }, [activeCompanyIds, setAllAccounts]);
`;

if(content.match(regex)) {
   content = content.replace(regex, missingCode);
   fs.writeFileSync('store/useAccountingStore.ts', content);
   console.log('Restored deleted code block');
} else {
   console.log('Regex did not match');
}
