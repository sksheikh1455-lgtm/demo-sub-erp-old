import fs from 'fs';

const path = 'components/PartnerLedgerReport.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/const displayOpBal = partnerType === ContactType\.VENDOR \? -opBal : opBal;/g, "const displayOpBal = opBal;");
content = content.replace(/const opDebit = isCustomer \? \(opBal > 0 \? opBal : 0\) : \(opBal < 0 \? Math\.abs\(opBal\) : 0\);/g, "const opDebit = opBal > 0 ? opBal : 0;");
content = content.replace(/const opCredit = isCustomer \? \(opBal < 0 \? Math\.abs\(opBal\) : 0\) : \(opBal > 0 \? opBal : 0\);/g, "const opCredit = opBal < 0 ? Math.abs(opBal) : 0;");

content = content.replace(/const currentBal = \(isCustomer \|\| isAssetTx\(t\)\) \? \(t\.debit - t\.credit\) : \(t\.credit - t\.debit\);/g, "const currentBal = t.debit - t.credit;");
content = content.replace(/bal \+= \(isCustomer \|\| isAssetTx\(t\)\) \? \(t\.debit - t\.credit\) : \(t\.credit - t\.debit\);/g, "bal += t.debit - t.credit;");

content = content.replace(/const displayOpBal = partnerType === ContactType\.VENDOR \? -openingBalance : openingBalance;/g, "const displayOpBal = openingBalance;");
content = content.replace(/const opDebit = isCustomer \? \(openingBalance > 0 \? openingBalance : 0\) : \(openingBalance < 0 \? Math\.abs\(openingBalance\) : 0\);/g, "const opDebit = openingBalance > 0 ? openingBalance : 0;");
content = content.replace(/const opCredit = isCustomer \? \(openingBalance < 0 \? Math\.abs\(openingBalance\) : 0\) : \(openingBalance > 0 \? openingBalance : 0\);/g, "const opCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0;");

content = content.replace(/const displayOpBal = isCustomer \? opBal : -opBal;/g, "const displayOpBal = opBal;");

fs.writeFileSync(path, content);
console.log("Replaced logic");
