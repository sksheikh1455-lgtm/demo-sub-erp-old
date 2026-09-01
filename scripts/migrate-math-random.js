import fs from 'fs';

let f1 = fs.readFileSync('components/ProductList.tsx', 'utf8');
f1 = f1.replace(/Math\.random\(\)\.toString\(36\)\.substr\(2, 9\)/g, "crypto.randomUUID()");
f1 = f1.replace(/Math\.random\(\)\.toString\(36\)\.substring\(7\)/g, "crypto.randomUUID()");
fs.writeFileSync('components/ProductList.tsx', f1);

let f2 = fs.readFileSync('components/InvoiceManager.tsx', 'utf8');
f2 = f2.replace(/Math\.random\(\)\.toString\(36\)\.substr\(2, 9\)/g, "crypto.randomUUID()");
fs.writeFileSync('components/InvoiceManager.tsx', f2);
