import fs from 'fs';

let content = fs.readFileSync('./components/InvoiceManager.tsx', 'utf8');
content = content.split('\\${').join('${');
fs.writeFileSync('./components/InvoiceManager.tsx', content);

let payContent = fs.readFileSync('./components/PaymentManager.tsx', 'utf8');
payContent = payContent.split('\\${').join('${');
fs.writeFileSync('./components/PaymentManager.tsx', payContent);
