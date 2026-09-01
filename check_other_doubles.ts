import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  console.log("Checking for duplicate payment numbers...");
  let page = 0;
  const size = 1000;
  const paymentNumbers = new Map();
  const duplicateNumbers = [];
  
  while (true) {
    const { data: payments } = await supabase.from('docs_payments').select('id, data').range(page * size, (page + 1) * size - 1);
    if (!payments || payments.length === 0) break;
    
    for (const p of payments) {
      const num = p.data?.number;
      if (num) {
         if (paymentNumbers.has(num)) duplicateNumbers.push(num);
         else paymentNumbers.set(num, true);
      }
    }
    page++;
  }
  
  console.log(`Found ${duplicateNumbers.length} duplicate payment numbers.`);
  if (duplicateNumbers.length > 0) console.log(duplicateNumbers.slice(0, 10));

  console.log("Checking for journals with multiple AR/AP lines or multiple Cash lines for the SAME contact...");
  const jmap = new Map();
  let from = 0;
  while (true) {
     const { data: lines } = await supabase.from('docs_journal_lines')
       .select('journal_id, contact_id, account_id')
       .not('contact_id', 'is', null)
       .range(from, from + size - 1);
       
     if (!lines || lines.length === 0) break;
     
     lines.forEach(l => {
        if (!l.journal_id) return;
        if (!jmap.has(l.journal_id)) jmap.set(l.journal_id, []);
        jmap.get(l.journal_id).push(l);
     });
     from += size;
  }

  let doubleArAp = 0;
  let doubleCash = 0;
  let doubleOtherTypes = 0;
  
  for (const [jid, lns] of jmap.entries()) {
      if (lns.length >= 2) {
         // Count AR/AP lines
         const arApLines = lns.filter(l => l.account_id.includes('-1002') || l.account_id.includes('-2001'));
         if (arApLines.length >= 2) {
            // Check if same contact
            const contacts = new Set(arApLines.map(l => l.contact_id));
            if (contacts.size === 1) doubleArAp++;
         }
         
         const cashLines = lns.filter(l => l.account_id.includes('-1001'));
         if (cashLines.length >= 2) {
            const contacts = new Set(cashLines.map(l => l.contact_id));
            if (contacts.size === 1) doubleCash++;
         }
         
         // Are there any INVOICES or BILLS with contact_id on BOTH AR/AP and Revenue/Expense?
         if (!jid.includes('PAY')) {
             const hasARAP = lns.some(l => l.account_id.includes('-1002') || l.account_id.includes('-2001'));
             const hasIncomeExpense = lns.some(l => l.account_id.includes('-400') || l.account_id.includes('-500'));
             if (hasARAP && hasIncomeExpense) {
                // If both lines have the same contact_id
                const contacts = new Set(lns.map(l => l.contact_id));
                if (contacts.size === 1) {
                    doubleOtherTypes++;
                }
             }
         }
      }
  }

  console.log(`Journals with multiple AR/AP lines for same contact: ${doubleArAp}`);
  console.log(`Journals with multiple Cash lines for same contact: ${doubleCash}`);
  console.log(`Non-payment journals with same contact on both sides: ${doubleOtherTypes}`);
}
run();
