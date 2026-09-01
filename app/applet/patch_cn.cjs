const fs = require('fs');
let code = fs.readFileSync('store/useAccountingStore.ts', 'utf8');

code = code.replace(/const \{ error: insertErr \} = await supabase\.from\('docs_credit_notes'\)\.insert\(\{ id: newId, data: newCn, company_id: companyId, status: newCn\.status \}\);/, 
`const { error: insertErr } = await supabase.from('docs_credit_notes').insert({ 
      id: newId, 
      data: newCn, 
      company_id: companyId, 
      status: newCn.status,
      credit_note_number: newCn.number || null,
      credit_note_date: newCn.date || new Date().toISOString().split('T')[0],
      date: newCn.date || new Date().toISOString().split('T')[0],
      customer_id: newCn.customerId,
      total: newCn.total || 0,
      subtotal: newCn.subtotal || 0,
      tax_total: newCn.taxTotal || 0,
      origin_invoice_id: newCn.originInvoiceId || null
    });`);

code = code.replace(/const \{ error: updateErr \} = await supabase\.from\('docs_credit_notes'\)\.update\(\{ data: updated, status: updated\.status \}\)\.eq\('id', id\);/,
`const { error: updateErr } = await supabase.from('docs_credit_notes').update({ 
      data: updated, 
      status: updated.status,
      credit_note_number: updated.number || null,
      credit_note_date: updated.date || new Date().toISOString().split('T')[0],
      date: updated.date || new Date().toISOString().split('T')[0],
      customer_id: updated.customerId,
      total: updated.total || 0,
      subtotal: updated.subtotal || 0,
      tax_total: updated.taxTotal || 0,
      origin_invoice_id: updated.originInvoiceId || null
    }).eq('id', id);`);

fs.writeFileSync('store/useAccountingStore.ts', code);
