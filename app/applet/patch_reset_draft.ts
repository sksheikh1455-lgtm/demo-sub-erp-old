import fs from 'fs';

function updateFile(path: string, replacer: (orig: string) => string) {
    if (!fs.existsSync(path)) return;
    const orig = fs.readFileSync(path, 'utf8');
    const modified = replacer(orig);
    if (orig !== modified) {
        fs.writeFileSync(path, modified);
        console.log(`Updated ${path}`);
    } else {
        console.log(`No change for ${path}`);
    }
}

// InvoiceManager
updateFile('./components/InvoiceManager.tsx', (code) => {
    return code.replace(
        /await store\.resetInvoiceToDraft\(editingId\);\s+window\.dispatchEvent/,
        `await store.resetInvoiceToDraft(editingId);\n        setFormData(prev => ({ ...prev, status: 'DRAFT' }));\n        window.dispatchEvent`
    );
});

// BillManager
updateFile('./components/BillManager.tsx', (code) => {
    return code.replace(
        /await store\.resetBillToDraft\(editingId\);\s+window\.dispatchEvent/,
        `await store.resetBillToDraft(editingId);\n        setFormData(prev => ({ ...prev, status: 'DRAFT' }));\n        window.dispatchEvent`
    );
});

// PaymentManager
updateFile('./components/PaymentManager.tsx', (code) => {
    return code.replace(
        /await store\.resetPaymentToDraft\(editingId\);\s+window\.dispatchEvent/,
        `await store.resetPaymentToDraft(editingId);\n        setFormData(prev => ({ ...prev, status: 'DRAFT' }));\n        window.dispatchEvent`
    );
});

// CreditNoteManager
updateFile('./components/CreditNoteManager.tsx', (code) => {
    return code.replace(
        /store\.resetCreditNoteToDraft\(editingId\!\);/,
        `store.resetCreditNoteToDraft(editingId!).then(() => setFormData(prev => ({ ...prev, status: 'DRAFT' })));`
    );
});

// ExpenseManager
updateFile('./components/ExpenseManager.tsx', (code) => {
    return code.replace(
        /store\.resetJournalEntryToDraft\(editingId\!\);/,
        `store.resetJournalEntryToDraft(editingId!).then(() => setFormData(prev => ({ ...prev, status: 'DRAFT' })));`
    );
});
