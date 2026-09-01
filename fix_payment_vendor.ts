import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: contacts } = await supabase.from('docs_contacts').select('id, data').ilike('data->>name', '%EXCEL TECHNOLOGIES%');
  let targetVendorId = '';
  
  // prefer the exact match or the one with isVendor
  const exact = contacts?.find(c => c.data?.name === 'EXCEL TECHNOLOGIES LTD');
  const vendorFlagged = contacts?.find(c => c.data?.isVendor === true);
  
  if (exact && exact.data?.isVendor) targetVendorId = exact.id;
  else if (vendorFlagged) targetVendorId = vendorFlagged.id;
  else if (exact) targetVendorId = exact.id;
  else targetVendorId = contacts?.[0]?.id || '';
  
  console.log('Using Vendor ID:', targetVendorId, contacts?.find(c => c.id === targetVendorId)?.data?.name);
  
  const paymentId = '4dacd943-ade2-4f06-a895-4911e561bcca';
  const journalId = 'JE-PAY-4DACD943-ADE2-4F06-A895-4911E561BCCA';

  // 1. Fetch payment
  const { data: pay } = await supabase.from('docs_payments').select('data').eq('id', paymentId).single();
  if (pay) {
    const updatedPay = { ...pay.data, contactId: targetVendorId };
    
    // Set journal to draft
    const { data: j } = await supabase.from('docs_journals').select('data').eq('id', journalId).single();
    if (j) {
        await supabase.from('docs_journals').update({ data: { ...j.data, status: 'DRAFT' } }).eq('id', journalId);
        
        // Update lines
        const { data: lines } = await supabase.from('docs_journal_lines').select('id').eq('journal_id', journalId);
        if (lines) {
            for (const l of lines) {
                await supabase.from('docs_journal_lines').update({ contact_id: targetVendorId }).eq('id', l.id);
            }
        }
        
        // Update payment itself
        await supabase.from('docs_payments').update({ contact_id: targetVendorId, data: updatedPay }).eq('id', paymentId);
        
        // Set journal to posted
        await supabase.from('docs_journals').update({ data: { ...j.data, status: 'POSTED' } }).eq('id', journalId);
        
        console.log('Payment and Journal successfully updated to point to new vendor.');
    }
  }
}
run();
