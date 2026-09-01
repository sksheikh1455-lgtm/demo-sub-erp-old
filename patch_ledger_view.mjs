import fs from 'fs';
const path = 'components/LedgerView.tsx';
if (fs.existsSync(path)) {
  let code = fs.readFileSync(path, 'utf8');
  
  const target = `const isOpBalTx = `;
  const replacement = `
            if (tx.journal_id && tx.journal_id.startsWith('JE-PAY-')) {
               const base = tx.journal_id.replace('JE-PAY-', '');
               if (ledger.some((l:any) => l.journal_id === 'JE-CPAY-' + base || l.journal_id === 'JE-VPAY-' + base)) {
                   return;
               }
            }
            
            const isOpBalTx = `;

  if (code.includes(target) && !code.includes('tx.journal_id.replace(\'JE-PAY-\'')) {
     code = code.replace(target, replacement);
     fs.writeFileSync(path, code);
     console.log("Patched LedgerView.tsx successfully.");
  } else {
     console.log("LedgerView.tsx already patched or target not found!");
  }
} else {
  console.log("LedgerView.tsx not found");
}
