import fs from 'fs';
const path = 'components/CashLedgerView.tsx';
let code = fs.readFileSync(path, 'utf8');

const target = `setOpeningBalance(ob);
        setTransactions(txs);`;

const replacement = `
        // Deduplicate JE-PAY- if JE-CPAY- exists
        const cpayIds = new Set(txs.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-CPAY-')).map((l:any) => l.journal_id.replace('JE-CPAY-', '')));
        const vpayIds = new Set(txs.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-VPAY-')).map((l:any) => l.journal_id.replace('JE-VPAY-', '')));
        
        txs = txs.filter((tx: any) => {
           if (tx.journal_id && tx.journal_id.startsWith('JE-PAY-')) {
               const base = tx.journal_id.replace('JE-PAY-', '');
               if (cpayIds.has(base) || vpayIds.has(base)) return false;
           }
           return true;
        });
        
        setOpeningBalance(ob);
        setTransactions(txs);`;

if (code.includes('setTransactions(txs);') && !code.includes('txs.filter((tx: any)')) {
   code = code.replace(target, replacement);
   fs.writeFileSync(path, code);
   console.log("Patched CashLedgerView.tsx successfully.");
} else {
   console.log("CashLedgerView.tsx already patched or target not found!");
}
