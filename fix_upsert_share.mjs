import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// The error happens because we select only 3 columns, then upsert them. 
// Upsert without all columns will set unmentioned columns to null or default, failing constraints.
// Let's replace the select to fetch all columns, and the map to keep all columns.

const oldSelect = `.select('id, company_ids, data')`;
const newSelect = `.select('*')`;

content = content.replace(oldSelect, newSelect);

const oldMap = `                // 3. Update existing products to include target company ID
                const toUpdate = sourceProducts.map(p => {
                   const arr = Array.from(new Set([...(p.company_ids || []), targetComp.id]));
                   const newData = { ...(p.data || {}), companyIds: arr };
                   return {
                      id: p.id,
                      company_ids: arr,
                      data: newData
                   };
                });`;

const newMap = `                // 3. Update existing products to include target company ID
                const toUpdate = sourceProducts.map(p => {
                   const arr = Array.from(new Set([...(p.company_ids || []), targetComp.id]));
                   const newData = { ...(p.data || {}), companyIds: arr };
                   return {
                      ...p,
                      company_ids: arr,
                      data: newData
                   };
                });`;

content = content.replace(oldMap, newMap);

fs.writeFileSync(path, content);
console.log('Fixed upsert columns');
