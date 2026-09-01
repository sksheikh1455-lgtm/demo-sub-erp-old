const fs = require('fs');
const file = 'services/reportingService.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    if (partnerType === 'LOAN_PAYABLE') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('loan payable') ||
        String(r.accountName || '').toLowerCase().includes('loan payable') ||
        String(r.account_id || r.accountId || '').slice(0, 4) === '2101' ||
        String(r.account_name).toLowerCase().includes('loan received')
      );
    }

    return mapped;`;

const replacement = `    if (partnerType === 'LOAN_PAYABLE') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('loan payable') ||
        String(r.accountName || '').toLowerCase().includes('loan payable') ||
        String(r.account_id || r.accountId || '').slice(0, 4) === '2101' ||
        String(r.account_name).toLowerCase().includes('loan received')
      );
    }

    if (partnerType === 'CUSTOMER') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('receivable') ||
        String(r.accountName || '').toLowerCase().includes('receivable') ||
        String(r.account_id || r.accountId || '').slice(0, 4) === '1002' ||
        String(r.account_type || r.accountType || '').toUpperCase() === 'RECEIVABLE'
      );
    }

    if (partnerType === 'VENDOR') {
      return mapped.filter((r: any) => 
        String(r.account_name).toLowerCase().includes('payable') ||
        String(r.accountName || '').toLowerCase().includes('payable') ||
        String(r.account_id || r.accountId || '').slice(0, 4) === '2001' ||
        String(r.account_type || r.accountType || '').toUpperCase() === 'PAYABLE'
      );
    }

    return mapped;`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync(file, code, 'utf8');
   console.log('Successfully patched reportingService.ts');
} else {
   console.log('Target string not found!');
}
