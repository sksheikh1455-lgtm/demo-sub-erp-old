import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  // 1. Get Accounts
  const { data: allAccounts } = await supabase.from('docs_accounts').select('id, data');
  const arAccounts = new Set(allAccounts?.filter(a => a.data?.type === 'RECEIVABLE').map(a => a.id));
  const apAccounts = new Set(allAccounts?.filter(a => a.data?.type === 'PAYABLE').map(a => a.id));
  
  if (arAccounts.size === 0) {
     allAccounts?.forEach(a => {
        if (a.id.includes('-1002')) arAccounts.add(a.id);
        if (a.id.includes('-2001')) apAccounts.add(a.id);
     });
  }

  // 2. Get Contacts
  const { data: contacts } = await supabase.from('docs_contacts').select('id, data');
  const customerMap = new Map();
  const vendorMap = new Map();
  
  contacts?.forEach(c => {
     const isCust = c.data?.isCustomer === true;
     const isVend = c.data?.isVendor === true;
     
     if (isCust && !isVend) customerMap.set(c.id, c.data?.name);
     if (isVend && !isCust) vendorMap.set(c.id, c.data?.name);
  });

  // 3. Scan Journal Lines
  let from = 0;
  const limit = 1000;
  
  const custInAp = new Map();
  const vendInAr = new Map();
  
  while (true) {
    const { data: lines, error } = await supabase.from('docs_journal_lines').select('contact_id, account_id, debit, credit').range(from, from + limit - 1);
    if (error) {
       console.error(error);
       break;
    }
    if (!lines || lines.length === 0) break;
    
    for (const l of lines) {
       if (!l.contact_id) continue;
       const amount = Number(l.debit || 0) - Number(l.credit || 0);
       
       if (customerMap.has(l.contact_id) && apAccounts.has(l.account_id)) {
           custInAp.set(l.contact_id, (custInAp.get(l.contact_id) || 0) + amount);
       }
       if (vendorMap.has(l.contact_id) && arAccounts.has(l.account_id)) {
           vendInAr.set(l.contact_id, (vendInAr.get(l.contact_id) || 0) + amount);
       }
    }
    from += limit;
  }
  
  // 4. Report
  console.log('--- CUSTOMERS IN VENDOR ACCOUNTS (AP) ---');
  let custFound = false;
  for (const [cid, amt] of custInAp.entries()) {
     if (Math.abs(amt) > 0.01) {
        console.log(`- ${customerMap.get(cid)} (AP Balance: ${amt})`);
        custFound = true;
     }
  }
  if (!custFound) console.log('None');

  console.log('--- VENDORS IN CUSTOMER ACCOUNTS (AR) ---');
  let vendFound = false;
  for (const [cid, amt] of vendInAr.entries()) {
     if (Math.abs(amt) > 0.01) {
        console.log(`- ${vendorMap.get(cid)} (AR Balance: ${amt})`);
        vendFound = true;
     }
  }
  if (!vendFound) console.log('None');
}
run();
