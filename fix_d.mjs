import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// For brands
content = content.replace(/const newBrands = sourceBrands\.map\(\(b\) => \{[\s\S]*?return \{[\s\S]*?name: d\.name[\s\S]*?updated_at: new Date\(\)\.toISOString\(\) \s*\};\s*\}\);/,
`const newBrands = sourceBrands.map((b) => {
                   const newId = crypto.randomUUID();
                   brandMap[b.id] = newId;
                   const newData = { ...b.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
                   delete newData.company_id;
                   delete newData.company_ids;
                   return { 
                       id: newId, 
                       data: newData, 
                       company_id: targetComp.id,
                       company_ids: [targetComp.id],
                       name: b.name || newData.name || '',
                       updated_at: new Date().toISOString()
                   };
                });`);

// For categories
content = content.replace(/const newCats = sourceCats\.map\(\(c\) => \{[\s\S]*?return \{[\s\S]*?name: d\.name[\s\S]*?updated_at: new Date\(\)\.toISOString\(\) \s*\};\s*\}\);/,
`const newCats = sourceCats.map((c) => {
                   const newId = crypto.randomUUID();
                   catMap[c.id] = newId;
                   const newData = { ...c.data, id: newId, companyIds: [targetComp.id], companyId: targetComp.id };
                   delete newData.company_id;
                   delete newData.company_ids;
                   return { 
                       id: newId, 
                       data: newData, 
                       company_id: targetComp.id,
                       company_ids: [targetComp.id],
                       name: c.name || newData.name || '',
                       updated_at: new Date().toISOString()
                   };
                });`);

fs.writeFileSync(path, content);
console.log('Fixed d is not defined');
