import fs from 'fs';

// Patch InvoiceManager.tsx handleDownloadPDF
let invContent = fs.readFileSync('./components/InvoiceManager.tsx', 'utf8');
if (invContent.includes("console.log('handleDownloadPDF: generateInvoicePDF call completed');") && !invContent.includes("was downloaded as PDF")) {
    invContent = invContent.replace(
        "console.log('handleDownloadPDF: generateInvoicePDF call completed');",
        `console.log('handleDownloadPDF: generateInvoicePDF call completed');
      if (tempInvoice?.id) {
        currentStore.updateInvoice(tempInvoice.id, {
          messages: [...(tempInvoice.messages || []), {
            id: crypto.randomUUID(),
            authorId: currentStore.currentUser?.id || 'user-1',
            body: \`Invoice \${tempInvoice.number || ''} was downloaded as PDF.\`,
            date: new Date().toISOString(),
            type: 'notification'
          }]
        });
      }`
    );
    fs.writeFileSync('./components/InvoiceManager.tsx', invContent);
    console.log("Patched InvoiceManager.tsx PDF download");
}

// Patch PaymentManager.tsx handleDownloadPDF
let payContent = fs.readFileSync('./components/PaymentManager.tsx', 'utf8');
if (payContent.includes("generatePaymentPDF(currentPayment, company, partner, store.currentUser?.name, partnerBalance);") && !payContent.includes("was downloaded as PDF")) {
    payContent = payContent.replace(
        "generatePaymentPDF(currentPayment, company, partner, store.currentUser?.name, partnerBalance);",
        `generatePaymentPDF(currentPayment, company, partner, store.currentUser?.name, partnerBalance);
    store.updatePayment(currentPayment.id, {
      messages: [...(currentPayment.messages || []), {
        id: crypto.randomUUID(),
        authorId: store.currentUser?.id || 'user-1',
        body: \`Payment \${currentPayment.number} was downloaded as PDF.\`,
        date: new Date().toISOString(),
        type: 'notification'
      }]
    });`
    );
    fs.writeFileSync('./components/PaymentManager.tsx', payContent);
    console.log("Patched PaymentManager.tsx PDF download");
}
