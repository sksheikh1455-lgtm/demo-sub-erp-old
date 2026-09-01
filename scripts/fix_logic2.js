import fs from 'fs';

const path = 'components/PartnerLedgerReport.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/runningBal \+= \(isCustomer \|\| isAssetTx\(t\)\) \? \(t\.debit - t\.credit\) : \(t\.credit - t\.debit\);/g, "runningBal += t.debit - t.credit;");
content = content.replace(/const addition = \(isCustomer \|\| isAssetTx\(t\)\) \? \(\(t\.debit \|\| 0\) - \(t\.credit \|\| 0\)\) : \(\(t\.credit \|\| 0\) - \(t\.debit \|\| 0\)\);/g, "const addition = (t.debit || 0) - (t.credit || 0);");

fs.writeFileSync(path, content);
console.log("Replaced logic 2");
