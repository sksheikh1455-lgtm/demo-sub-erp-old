import fs from 'fs';

let content = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const regex = /const generateNextNumber = useCallback\(\(type: 'INVOICE'.*?\}\);/s;

const newString = `const generateNextNumber = useCallback((type: 'INVOICE' | 'BILL' | 'CREDIT_NOTE' | 'PAYMENT' | 'ADJUSTMENT' | 'JOURNAL' | 'EXPENSE' | 'CONTACT' | 'PRODUCT' | 'CATEGORY' | 'BRAND' | 'ACCOUNT', dateStr: string, targetCompanyId?: string, subType?: string) => {
    // Rely entirely on DB sequence triggers for auto-numbering
    // We only provide DRAFT identifiers in the frontend until PostgreSQL assigns the REAL sequential number
    const isDraftable = ['INVOICE', 'BILL', 'CREDIT_NOTE', 'PAYMENT', 'ADJUSTMENT', 'JOURNAL', 'EXPENSE'].includes(type);
    
    if (isDraftable) {
      return \`DRAFT-\${generateUUID().substring(0, 8).toUpperCase()}\`;
    }
    
    return ''; // DB triggers generate sequence numbers for items with no drafts (Contacts, Products)
  }, []);`;

if(content.match(regex)) {
   content = content.replace(regex, newString);
   fs.writeFileSync('store/useAccountingStore.ts', content);
   console.log('Modified generateNextNumber');
} else {
   console.log('Regex did not match');
}
