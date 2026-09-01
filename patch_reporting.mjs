import fs from 'fs';

const path = 'services/reportingService.ts';
let code = fs.readFileSync(path, 'utf-8');

const target = `    const mapped = (data || []).map((row: any) => ({
      ...row,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0
    }));`;

const replacement = `    let mapped = (data || []).map((row: any) => ({
      ...row,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0
    }));

    // Deduplicate payment journals: if a JE-PAY- variant and a JE-CPAY-/JE-VPAY- variant exist for the same payment, drop the JE-PAY- one.
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
    });`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync(path, code);
   console.log("Patched reportingService.ts successfully.");
} else {
   console.log("Target string not found in reportingService.ts!");
}
