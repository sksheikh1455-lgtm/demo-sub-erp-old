import fs from 'fs';

const path = 'components/Settings.tsx';
let content = fs.readFileSync(path, 'utf8');

// replace the old return object inside map
content = content.replace(
  `companyId: targetComp.id,
           stock: 0,
           openingStock: 0,
           quantity: 0`,
  `companyId: targetComp.id,
           companyIds: [targetComp.id],
           stock: 0,
           openingStock: 0,
           quantity: 0,
           quantityOnHand: 0,
           openingBalance: 0,
           stockLevels: {},
           initialStockLevels: {}`
);

fs.writeFileSync(path, content);
