import fs from 'fs';
const path = 'components/PartnerLedgerReport.tsx';
let code = fs.readFileSync(path, 'utf8');

const target = `const isOpBalTx = `;
const replacement = `
          // Hard drop duplicate JE-PAY- if System and CPAY exists. Actually, drop any JE-PAY- if another JE-CPAY- exists for the same base ID.
          if (tx.journal_id && tx.journal_id.startsWith('JE-PAY-')) {
             const base = tx.journal_id.replace('JE-PAY-', '');
             if (ledger.some((l:any) => l.journal_id === 'JE-CPAY-' + base || l.journal_id === 'JE-VPAY-' + base)) {
                 return;
             }
          }
          
          const isOpBalTx = `;

if (code.includes(target) && !code.includes('drop duplicate JE-PAY- if System')) {
   code = code.replace(target, replacement);
   fs.writeFileSync(path, code);
   console.log("Patched PartnerLedgerReport.tsx successfully.");
} else {
   console.log("Already patched or target not found!");
}
