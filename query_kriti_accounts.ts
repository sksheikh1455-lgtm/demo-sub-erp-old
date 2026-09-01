import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: accounts } = await supabase.from('docs_accounts').select('id, data').in('id', ['comp-1-100201', 'comp-1-200100', 'comp-1-210100']);
  accounts?.forEach(a => {
     console.log('Account:', a.id, a.data?.name, a.data?.code, a.data?.type);
  });

  // check if there is any journal line for contact KRITI with Account Payable (usually 200100 or something with 'Payable')
  const contactId = '5f9bf155-2cb0-4817-b7df-4f9b053724d9';
  
  let allJournals: any[] = [];
  let from = 0;
  const limit = 1000;
  while(true) {
    const { data: journals } = await supabase.from('docs_journals').select('id, data').range(from, from+limit-1);
    if (!journals || journals.length === 0) break;
    allJournals = allJournals.concat(journals);
    from += limit;
  }
  
  allJournals.forEach(j => {
     j.data?.lines?.forEach((l:any) => {
        if (l.contactId === contactId && l.accountId !== 'comp-1-100201') {
           console.log(`Other account line for Kriti: Journal ${j.id}, Acc: ${l.accountId}, code: ${l.accountCode}, DR: ${l.debit}, CR: ${l.credit}`);
        }
     });
  });

  // Let's also check if openingBalance is positive or negative. The user has openingBalance: 2102.7. Is that positive? Usually positive opening balance for Customer means they owe us (Debit AR). Wait, the openingBalanceType in docs_contacts might exist.
  const { data: contact } = await supabase.from('docs_contacts').select('data').eq('id', contactId).single();
  console.log('openingBalance:', contact?.data?.openingBalance, 'openingBalances:', contact?.data?.openingBalances, 'type:', contact?.data?.type);
}
run();
