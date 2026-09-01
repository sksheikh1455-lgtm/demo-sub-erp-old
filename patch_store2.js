const fs = require('fs');
const path = 'store/useAccountingStore.ts';
let content = fs.readFileSync(path, 'utf8');

const targetAdd = \`        const processedInvoice = rpcData?.processed_invoice;
        if (processedInvoice) {
            Object.assign(newInvoice, processedInvoice);
        }
        success = true;\`;
const replacementAdd = \`        const processedInvoice = rpcData?.processed_invoice;
        if (processedInvoice) {
            Object.assign(newInvoice, processedInvoice);
        }
        // Fetch the fully calculated record from DB
        const { data: fetchReq } = await supabase.from('docs_invoices').select('data').eq('id', newInvoice.id).single();
        if (fetchReq && fetchReq.data) {
             Object.assign(newInvoice, fetchReq.data);
        }
        success = true;\`;

const targetUpdate = \`    const processedInvoice = rpcData?.processed_invoice;
    if (processedInvoice) {
        Object.assign(updatedInvoice, processedInvoice);
    }

    setLocalOnlyInvoices(prev => prev.map(i => i.id === id ? updatedInvoice : i));\`;
const replacementUpdate = \`    const processedInvoice = rpcData?.processed_invoice;
    if (processedInvoice) {
        Object.assign(updatedInvoice, processedInvoice);
    }
    
    // Fetch the fully calculated record from DB
    const { data: fetchReq } = await supabase.from('docs_invoices').select('data').eq('id', id).single();
    if (fetchReq && fetchReq.data) {
        Object.assign(updatedInvoice, fetchReq.data);
    }

    setLocalOnlyInvoices(prev => prev.map(i => i.id === id ? updatedInvoice : i));\`;

if (content.includes(targetAdd)) {
  content = content.replace(targetAdd, replacementAdd);
  console.log('Replaced addInvoice');
} else {
  console.log('addInvoice block not found');
}

if (content.includes(targetUpdate)) {
  content = content.replace(targetUpdate, replacementUpdate);
  console.log('Replaced updateInvoice');
} else {
  console.log('updateInvoice block not found');
}

fs.writeFileSync(path, content, 'utf8');
