import * as fs from 'fs';

let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const regex = /const \{ data: latestProds \} = await \(async \(\) => \{\s*let allData: any\[\] = \[\];\s*for \(let offset = 0; offset < 20000; offset \+= 1000\) \{\s*const res = await supabase\.from\('docs_products'\)\.select\('\*'\)\.order\('id'\)\.range\(offset, offset \+ 1000 - 1\);\s*if \(\!res\.data\) break;\s*allData = allData\.concat\(res\.data\);\s*if \(res\.data\.length < 1000\) break;\s*\}\s*return \{ data: allData \};\s*\}\)\(\);/g;

let count = 0;
content = content.replace(regex, () => {
    count++;
    return 'const latestProds: any[] | null = null;';
});

console.log(`Replaced ${count} occurrences`);

// Also handling without any[]
const regex2 = /const \{ data: latestProds \} = await \(async \(\) => \{\s*let allData = \[\];\s*for \(let offset = 0; offset < 20000; offset \+= 1000\) \{\s*const res = await supabase\.from\('docs_products'\)\.select\('\*'\)\.order\('id'\)\.range\(offset, offset \+ 1000 - 1\);\s*if \(\!res\.data\) break;\s*allData = allData\.concat\(res\.data\);\s*if \(res\.data\.length < 1000\) break;\s*\}\s*return \{ data: allData \};\s*\}\)\(\);/g;

content = content.replace(regex2, () => {
    count++;
    return 'const latestProds: any[] | null = null;';
});

console.log(`Replaced ${count} occurrences total`);

fs.writeFileSync('store/useAccountingStore.ts', content, 'utf8');
