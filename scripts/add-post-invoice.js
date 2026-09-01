import fs from 'fs';

let lines = fs.readFileSync('store/useAccountingStore.ts', 'utf8').split('\n');

const insertPos = lines.findIndex(l => l.includes('const postPayment ='));

if (insertPos > -1) {
  const newPostInvoice = `  const postInvoice = useCallback(async (invoice: Invoice) => {
    let invoiceToSave = { ...invoice };
    const companyId = invoiceToSave.companyId || activeCompanyIds[0];
    invoiceToSave.companyId = companyId;

    const { error: upsertError } = await supabase.from('docs_invoices').upsert({
      id: invoiceToSave.id,
      data: invoiceToSave,
      company_id: companyId,
      updated_at: new Date().toISOString()
    });
    if (upsertError) throw upsertError;

    if (invoiceToSave.status === 'POSTED') {
      const resp = await supabase.rpc('post_invoice', {
        p_invoice_id: invoiceToSave.id,
        p_company_id: companyId
      });
      if (resp.error) throw resp.error;
      if (resp.data && !resp.data.success) throw new Error(resp.data.error || 'Posting failed');
      
      if (currentUser?.id) fetchInitialData(currentUser.id);
    }
    
    return invoiceToSave;
  }, [activeCompanyIds, currentUser, fetchInitialData]);
`;
  
  lines.splice(insertPos, 0, newPostInvoice);
  fs.writeFileSync('store/useAccountingStore.ts', lines.join('\n'));
  console.log('Added postInvoice');
} else {
  console.log('Could not find boundaries', insertPos);
}
