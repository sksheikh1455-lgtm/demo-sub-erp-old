import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `    company_ids: [targetComp.id],
    name: newData.name || 'Untitled',
    category: newData.category || 'All',
    price: Number(newData.price || 0),
    sku: newData.sku || '',
    description: newData.description || '',
    brand: newData.brand || '',
    type: newData.type || 'Goods',
    uom: newData.uom || 'Units',
    track_inventory: newData.trackInventory !== false,
    can_be_sold: newData.canBeSold !== false,
    can_be_purchased: newData.canBePurchased !== false,
    updated_at: new Date().toISOString()`;

content = content.replace(/    company_ids: \[targetComp\.id\],[\s\S]*?updated_at: new Date\(\)\.toISOString\(\)/g, replacement);

fs.writeFileSync(path, content);
console.log('Fixed missing fields for products');
