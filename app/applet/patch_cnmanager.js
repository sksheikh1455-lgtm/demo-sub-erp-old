const fs = require('fs');
let code = fs.readFileSync('components/CreditNoteManager.tsx', 'utf8');

const target = `      // Automatically post immediately on confirm to reflect inventory
      const postedCN = await store.postCreditNote(cnToPost);
      setPendingCN(postedCN || cnToPost);
      setShowAvailableCreditPopup(true);`;

const replacement = `      // Automatically post immediately on confirm to reflect inventory
      const postedCN = await store.postCreditNote(cnToPost);
      const activeCN = postedCN || cnToPost;
      setPendingCN(activeCN);
      
      const customer = (store.contacts || []).find((c) => c.id === activeCN.customerId);
      const isCashSale = customer && customer.name.toLowerCase() === 'cash sale';

      if (isCashSale) {
        // Automatically give a refund for cash sales
        await store.postPayment({
          amount: activeCN.total,
          contactId: activeCN.customerId,
          date: activeCN.date,
          method: 'CASH',
          type: 'REFUND', 
          reference: \`CPAY/REF-\${String(activeCN.number || '').split('/').pop()}\`,
          accountId: findLiquidityAccount(store.accounts),
          partnerAccountId: findPartnerAccount(store.accounts, 'RECEIVABLE'),
          companyId: activeCN?.companyId,
          status: 'POSTED'
        });

        if (activeCN.originInvoiceId) {
          try {
            await store.applyCreditToInvoice(activeCN.id, activeCN.originInvoiceId, activeCN.total);
          } catch (e) {
            console.warn("Auto-apply to origin invoice failed during refund:", e);
          }
        } else {
          await store.updateCreditNote(activeCN.id, { 
            amountPaid: (activeCN.amountPaid || 0) + activeCN.total,
            status: 'CLOSED'
          });
        }
        
        setEditingId(null);
        setShowForm(false);
        setPendingCN(null);
        if (onClearOrigin) typeof onClearOrigin === 'function' && onClearOrigin();
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Cash refund processed automatically', type: 'success' } }));
      } else {
        setShowAvailableCreditPopup(true);
      }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('components/CreditNoteManager.tsx', code);
    console.log("Success frontend UI patched.");
} else {
    console.log("Target code not found. Here is the block from the file:");
    console.log(code.substring(code.indexOf('// Automatically post immediately'), code.indexOf('// Automatically post immediately') + 500));
}
