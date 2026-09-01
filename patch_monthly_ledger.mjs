import fs from 'fs';
const path = 'components/MonthlyGeneralLedgerReport.tsx';
if (fs.existsSync(path)) {
  let code = fs.readFileSync(path, 'utf8');
  
  const target = `const finalData = await injectMissingSequence(reportData || []);`;
  const replacement = `
          // Deduplicate
          let filtered = reportData || [];
          const cpayIds = new Set(filtered.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-CPAY-')).map((l:any) => l.journal_id.replace('JE-CPAY-', '')));
          const vpayIds = new Set(filtered.filter((l:any) => l.journal_id && l.journal_id.startsWith('JE-VPAY-')).map((l:any) => l.journal_id.replace('JE-VPAY-', '')));
          
          filtered = filtered.filter((tx: any) => {
             if (tx.journal_id && tx.journal_id.startsWith('JE-PAY-')) {
                 const base = tx.journal_id.replace('JE-PAY-', '');
                 if (cpayIds.has(base) || vpayIds.has(base)) return false;
             }
             return true;
          });
          
          const finalData = await injectMissingSequence(filtered);`;

  if (code.includes(target) && !code.includes('filtered.filter')) {
     code = code.replace(target, replacement);
     fs.writeFileSync(path, code);
     console.log("Patched MonthlyGeneralLedgerReport.tsx successfully.");
  } else {
     console.log("MonthlyGeneralLedgerReport.tsx already patched or target not found!");
  }
} else {
  console.log("MonthlyGeneralLedgerReport.tsx not found");
}
