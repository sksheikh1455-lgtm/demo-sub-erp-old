import fs from 'fs';

let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

const postPaymentStart = code.indexOf(`const postPayment = useCallback(async (payment: any) => {`);
const postPaymentEnd = code.indexOf(`  const addInventoryAdjustment = useCallback(async (`);

if (postPaymentStart > -1 && postPaymentEnd > -1) {
  const newPostPayment = `const postPayment = useCallback(async (payment: any) => {
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
  code = code.substring(0, postPaymentStart) + newPostPayment + code.substring(postPaymentEnd);
  fs.writeFileSync('store/useAccountingStore.ts', code);
  console.log('Replaced postPayment');
} else {
  console.log('Could not find boundaries', postPaymentStart, postPaymentEnd);
}
