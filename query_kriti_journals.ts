import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const contactId = '5f9bf155-2cb0-4817-b7df-4f9b053724d9';

  const { data: bills, error: e1 } = await supabase.from('docs_bills').select('*');
  if (bills) {
    const b = bills.filter(x => x.data?.vendorId === contactId || x.data?.contactId === contactId);
    console.log('Bills:', b.length);
  }

  const { data: invoices, error: e2 } = await supabase.from('docs_invoices').select('*');
  if (invoices) {
    const inv = invoices.filter(x => x.data?.customerId === contactId || x.data?.contactId === contactId);
    console.log('Invoices:', inv.length);
  }

  const { data: payments, error: e3 } = await supabase.from('docs_payments').select('id, data, contact_id');
  if (payments) {
    const pay = payments.filter(x => x.contact_id === contactId || x.data?.contactId === contactId);
    console.log('Payments:', pay.length);
    console.log('Payment details:', pay);
  }

  const { data: creditNotes } = await supabase.from('docs_credit_notes').select('id, data, contact_id');
  if (creditNotes) {
    const cn = creditNotes.filter(x => x.contact_id === contactId || x.data?.customerId === contactId);
    console.log('Credit Notes:', cn.length);
  }

  // Check journals
  let allJournals: any[] = [];
  let from = 0;
  const limit = 1000;
  while(true) {
    const { data: journals } = await supabase.from('docs_journals').select('id, data').range(from, from+limit-1);
    if (!journals || journals.length === 0) break;
    allJournals = allJournals.concat(journals);
    from += limit;
  }
  
  const contactJournals = allJournals.filter(j => {
     const lines = j.data?.lines || [];
     return lines.some((l: any) => l.contactId === contactId);
  });
  console.log('Journals with this contact:', contactJournals.length);
  
  contactJournals.forEach(j => {
     console.log('Journal', j.id);
     j.data?.lines?.forEach((l:any) => {
        if (l.contactId === contactId) {
          console.log(` - Acc: ${l.accountId}, code: ${l.accountCode}, name: ${l.accountName}, DR: ${l.debit}, CR: ${l.credit}`);
        }
     });
  });

  // check for docs_contacts themselves (maybe vendor balance is calculated from opening balance type)
  const { data: contact } = await supabase.from('docs_contacts').select('data').eq('id', contactId).single();
  console.log('Contact data:', JSON.stringify(contact?.data, null, 2));

}
run();
