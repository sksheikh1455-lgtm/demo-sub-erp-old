import fs from 'fs';

let lines = fs.readFileSync('store/useAccountingStore.ts', 'utf8').split('\n');

const startIndex = lines.findIndex(l => l.includes('const postPayment ='));
const endIndex = lines.findIndex(l => l.includes('const postCreditNote ='));

if (startIndex > -1 && endIndex > -1) {
  const newPostPayment = `  const postPayment = useCallback(async (payment: any) => {
    const paymentId = payment.id || generateUUID();
    const existingPayment = allPayments.find(p => p.id === paymentId);
    
    let paymentToSave = {
      ...existingPayment,
      ...payment,
      id: paymentId,
      status: payment.status || existingPayment?.status || 'DRAFT'
    };

    const companyId = paymentToSave.companyId || activeCompanyIds[0];
    paymentToSave.companyId = companyId;

    const { error: upsertError } = await supabase.from('docs_payments').upsert({
      id: paymentId,
      data: paymentToSave,
      company_id: companyId,
      updated_at: new Date().toISOString()
    });
    if (upsertError) throw upsertError;

    if (paymentToSave.status === 'POSTED') {
      const resp = await supabase.rpc('post_payment', {
        p_payment_id: paymentId,
        p_company_id: companyId
      });
      if (resp.error) throw resp.error;
      if (resp.data && !resp.data.success) throw new Error(resp.data.error || 'Posting failed');
      
      if (currentUser?.id) fetchInitialData(currentUser.id);
    }
    
    return paymentToSave;
  }, [allPayments, activeCompanyIds, currentUser, fetchInitialData]);

`;
  
  lines.splice(startIndex, endIndex - startIndex, newPostPayment);
  fs.writeFileSync('store/useAccountingStore.ts', lines.join('\n'));
  console.log('Replaced postPayment');
} else {
  console.log('Could not find boundaries', startIndex, endIndex);
}
