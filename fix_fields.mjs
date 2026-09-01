import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /return \{ id: newId, data: newData, company_id: targetComp.id, updated_at: new Date\(\)\.toISOString\(\) \};/g;

const replacement = `return { 
                       id: newId, 
                       data: newData, 
                       company_id: targetComp.id, 
                       company_ids: [targetComp.id],
                       name: d.name || p.name || '',
                       category: d.category || p.category || '',
                       price: Number(d.price || p.price) || 0,
                       updated_at: new Date().toISOString() 
                   };`;

content = content.replace(regex, replacement);

fs.writeFileSync(path, content);
console.log('Fixed fields in Dashboard.tsx');
