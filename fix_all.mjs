import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// replace the first block that doesn't have company_ids
content = content.replace(/return \{ id: newId, data: newData, company_id: targetComp\.id \};/g, 
`return { 
    id: newId, 
    data: newData, 
    company_id: targetComp.id,
    company_ids: [targetComp.id],
    name: newData.name || '',
    category: newData.category || '',
    price: Number(newData.price || 0),
    updated_at: new Date().toISOString()
};`);

fs.writeFileSync(path, content);
console.log("Fixed all instances of return");
