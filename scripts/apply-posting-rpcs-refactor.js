import fs from 'fs';

const filePath = 'store/useAccountingStore.ts';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Replace postInvoice
const postInvoiceStart = code.indexOf(`const postInvoice = useCallback(async (invoice: Invoice, productsOverride?: Product[]) => {`);
const postInvoiceEnd = code.indexOf(`const updateInvoice = useCallback(async (id: string, updates: Partial<Invoice>) => {`);
if (postInvoiceStart > -1 && postInvoiceEnd > -1) {
  const newPostInvoice = `const postInvoice = useCallback(async (invoice: Invoice, productsOverride?: Product[]) => {
    if (invoice.status === 'POSTED' || invoice.status === 'PAID') return invoice;

    let attempts = 0;
    let rpcRes: any;
    let rpcError: any;

    while (attempts < 3) {
      const { data, error } = await supabase.rpc('post_invoice', {
        p_invoice_id: invoice.id,
        p_company_id: invoice.companyId
      });
      rpcRes = data;
      rpcError = error;

      if (!rpcError && rpcRes && rpcRes.success) break;
      if (rpcError?.message?.includes('not found') || (rpcRes && !rpcRes.success && rpcRes.error?.includes('not found'))) {
        attempts++;
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      break;
    }

    if (rpcError) throw rpcError;
    if (rpcRes && !rpcRes.success) throw new Error(rpcRes.error || 'Posting failed');

    // Force a broad refetch to grab updated invoices, journals, payments (for cash sales), transactions, and products
    fetchData();

    return { ...invoice, status: 'POSTED' as any };
  }, [fetchData]);

  `;
  code = code.substring(0, postInvoiceStart) + newPostInvoice + code.substring(postInvoiceEnd);
}

// 2. Replace postBill
const postBillStart = code.indexOf(`const postBill = useCallback(async (bill: Bill) => {`);
const postBillEnd = code.indexOf(`const addPayment = useCallback(async (payment: any) => {`);
if (postBillStart > -1 && postBillEnd > -1) {
  const newPostBill = `const postBill = useCallback(async (bill: Bill) => {
    if (bill.status === 'POSTED') return bill;

    let attempts = 0;
    let rpcRes: any;
    let rpcError: any;

    while (attempts < 3) {
      const { data, error } = await supabase.rpc('post_bill', {
        p_bill_id: bill.id,
        p_company_id: bill.companyId
      });
      rpcRes = data;
      rpcError = error;

      if (!rpcError && rpcRes && rpcRes.success) break;
      if (rpcError?.message?.includes('not found') || (rpcRes && !rpcRes.success && rpcRes.error?.includes('not found'))) {
        attempts++;
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      break;
    }

    if (rpcError) throw rpcError;
    if (rpcRes && !rpcRes.success) throw new Error(rpcRes.error || 'Posting failed');

    fetchData();

    return { ...bill, status: 'POSTED' as any };
  }, [fetchData]);

  `;
  code = code.substring(0, postBillStart) + newPostBill + code.substring(postBillEnd);
}

// 3. Replace postPayment
const postPaymentStart = code.indexOf(`const postPayment = useCallback(async (payment: any) => {`);
const postPaymentEnd = code.indexOf(`const addInvoice = useCallback(async (invoice: Omit<Invoice, 'id' | 'companyId' | 'createdById'>) => {`);
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
      
      fetchData();
    }
    
    return paymentToSave;
  }, [allPayments, activeCompanyIds, fetchData]);

  `;
  code = code.substring(0, postPaymentStart) + newPostPayment + code.substring(postPaymentEnd);
}

// 4. Replace postCreditNote
const postCreditNoteStart = code.indexOf(`const postCreditNote = useCallback(async (cn: CreditNote) => {`);
const postCreditNoteEnd = code.indexOf(`const getCustomerBalance = useCallback((customerId: string) => {`);
if (postCreditNoteStart > -1 && postCreditNoteEnd > -1) {
  const newPostCreditNote = `const postCreditNote = useCallback(async (cn: CreditNote) => {
    if (cn.status === 'POSTED' || cn.status === 'OPEN' || cn.status === 'CLOSED' || cn.status === 'VOID') return cn;

    const companyId = cn.companyId || activeCompanyIds[0];
    const { data: respData, error } = await supabase.rpc('post_credit_note', {
      p_cn_id: cn.id,
      p_company_id: companyId
    });

    if (error) throw error;
    if (respData && !respData.success) throw new Error(respData.error || 'Posting failed');

    fetchData();

    return { ...cn, status: 'OPEN' as any };
  }, [activeCompanyIds, fetchData]);

  `;
  code = code.substring(0, postCreditNoteStart) + newPostCreditNote + code.substring(postCreditNoteEnd);
}

fs.writeFileSync(filePath, code);
console.log('Successfully refactored Zustand orchestrations to pure RPC calls.');
