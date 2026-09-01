import fs from 'fs';

const fixFile = (path: string) => {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(
        /await supabase\.from\('docs_companies'\)\.upsert\(\{\s*id: 'comp-1',\s*name: 'Default Company',\s*code: 'DEF',\s*currency: 'USD'\s*\}\)/g,
        "await supabase.from('docs_companies').upsert({ id: 'comp-1', name: 'Default Company', code: 'DEF', currency: 'USD' }, { onConflict: 'id', ignoreDuplicates: true })"
    );
    content = content.replace(
        /await supabase\.from\('docs_companies'\)\.upsert\(\{\s*id: 'comp-1',\s*name: 'Default Company',\s*code: 'DEF'\s*\}\)/g,
        "await supabase.from('docs_companies').upsert({ id: 'comp-1', name: 'Default Company', code: 'DEF' }, { onConflict: 'id', ignoreDuplicates: true })"
    );
    fs.writeFileSync(path, content);
};

fixFile('store/useAuthSlice.ts');
fixFile('store/useAccountingStore.ts');
console.log('Fixed');
