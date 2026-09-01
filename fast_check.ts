import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: contacts } = await supabase.from('docs_contacts').select('id, data');
  const custMap = new Map();
  const vendMap = new Map();
  const custIds: string[] = [];
  const vendIds: string[] = [];

  contacts?.forEach(c => {
     const isCust = c.data?.isCustomer === true;
     const isVend = c.data?.isVendor === true;
     if (isCust && !isVend) {
         custMap.set(c.id, c.data?.name);
         custIds.push(c.id);
     }
     if (isVend && !isCust) {
         vendMap.set(c.id, c.data?.name);
         vendIds.push(c.id);
     }
  });

  // Since we know the typical accounts:
  // Account Payable: ends with -200100, -200101
  // Account Receivable: ends with -100201

  // Let's check customers who have lines in -200100 or -200101
  console.log("Checking customers in AP...");
  const custInAp = new Map();
  let from = 0;
  let limit = 1000;
  while(true) {
      const { data: lines } = await supabase.from('docs_journal_lines')
        .select('contact_id, debit, credit')
        .like('account_id', '%-2001%')
        .range(from, from+limit-1);
      
      if (!lines || lines.length === 0) break;
      for (const l of lines) {
         if (custMap.has(l.contact_id)) {
            const amt = Number(l.debit||0) - Number(l.credit||0);
            custInAp.set(l.contact_id, (custInAp.get(l.contact_id) || 0) + amt);
         }
      }
      from += limit;
  }

  // Let's check vendors who have lines in -100201
  console.log("Checking vendors in AR...");
  const vendInAr = new Map();
  from = 0;
  while(true) {
      const { data: lines } = await supabase.from('docs_journal_lines')
        .select('contact_id, debit, credit')
        .like('account_id', '%-100201%')
        .range(from, from+limit-1);
      
      if (!lines || lines.length === 0) break;
      for (const l of lines) {
         if (vendMap.has(l.contact_id)) {
            const amt = Number(l.debit||0) - Number(l.credit||0);
            vendInAr.set(l.contact_id, (vendInAr.get(l.contact_id) || 0) + amt);
         }
      }
      from += limit;
  }

  console.log('--- CUSTOMERS IN VENDOR ACCOUNTS (AP) ---');
  let cfound = false;
  for (const [cid, amt] of custInAp.entries()) {
     if (Math.abs(amt) > 0.01) {
         console.log(`- ${custMap.get(cid)} (AP Balance: ${amt})`);
         cfound = true;
     }
  }
  if (!cfound) console.log('None');

  console.log('--- VENDORS IN CUSTOMER ACCOUNTS (AR) ---');
  let vfound = false;
  for (const [cid, amt] of vendInAr.entries()) {
     if (Math.abs(amt) > 0.01) {
         console.log(`- ${vendMap.get(cid)} (AR Balance: ${amt})`);
         vfound = true;
     }
  }
  if (!vfound) console.log('None');
}
run();
