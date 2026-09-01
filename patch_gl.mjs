import fs from 'fs';

const path = 'services/reportingService.ts';
let code = fs.readFileSync(path, 'utf-8');

const target = `    return (data || []).map((row: any) => ({
      ...row,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0
    })) as GeneralLedgerEntry[];`;

const replacement = `    let mapped = (data || []).map((row: any) => ({
      ...row,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0
    })) as GeneralLedgerEntry[];

    const baseIds = new Set();
    mapped.forEach((r: any) => {
        if (r.journal_id && (r.journal_id.startsWith('JE-CPAY-') || r.journal_id.startsWith('JE-VPAY-'))) {
            baseIds.add(r.journal_id.replace('JE-CPAY-', '').replace('JE-VPAY-', ''));
        }
    });
    
    mapped = mapped.filter((r: any) => {
        if (r.journal_id && r.journal_id.startsWith('JE-PAY-')) {
            const baseId = r.journal_id.replace('JE-PAY-', '');
            if (baseIds.has(baseId)) {
                return false; // drop duplicate
            }
        }
        return true;
    });

    return mapped;`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync(path, code);
   console.log("Patched getGeneralLedger successfully.");
} else {
   console.log("Target string not found in reportingService.ts (getGeneralLedger)!");
}
