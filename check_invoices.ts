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
  const { data: invoices } = await supabase.from('docs_invoices').select('id, data').limit(1000);
  const kriti = invoices?.filter(x => x.data?.customerId === contactId || x.data?.contactId === contactId);
  
  console.log('Invoices:', kriti?.length);
  
  if (kriti) {
    let totalInv = 0;
    for (const inv of kriti) {
       totalInv += Number(inv.data?.total) || 0;
       const jid = inv.data?.journalEntryId || inv.data?.journalId;
       if (jid) {
          const { data: j } = await supabase.from('docs_journals').select('data').eq('id', jid).single();
          console.log(`Invoice ${inv.data?.number} Journal ${jid}:`);
          console.log(j?.data?.lines?.map((l:any) => ({acc: l.accountId, contactId: l.contactId, DR: l.debit, CR: l.credit})));
       }
    }
    console.log('Total Inv Amount:', totalInv);
  }
}
run();
