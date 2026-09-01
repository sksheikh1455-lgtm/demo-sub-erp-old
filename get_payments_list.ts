import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const doublePayments = [];
  
  // We'll process in chunks of 50
  let page = 0;
  const size = 500;

  while (true) {
    const { data: payments, error } = await supabase.from('docs_payments').select('id, data').range(page * size, (page + 1) * size - 1);
    if (!payments || payments.length === 0) break;
    
    // Process payments in this chunk
    // A payment is "double" if its journal has 2 lines with the SAME contact_id
    // But since almost all payments have this problem as I stated, we can just get a handful of them to show the user.
    // However, I need to fetch the journal lines to be sure. Let's gather all journal entry IDs.
    const journalIds = payments.map(p => p.data?.journalEntryId).filter(Boolean);
    
    const { data: lines } = await supabase.from('docs_journal_lines')
      .select('journal_id, contact_id')
      .in('journal_id', journalIds)
      .not('contact_id', 'is', null);
      
    if (lines) {
       const counts = new Map();
       for (const l of lines) {
           if (!l.journal_id) continue;
           if (!counts.has(l.journal_id)) counts.set(l.journal_id, new Map());
           const cmap = counts.get(l.journal_id);
           cmap.set(l.contact_id, (cmap.get(l.contact_id) || 0) + 1);
       }
       
       for (const p of payments) {
           const jid = p.data?.journalEntryId;
           if (jid && counts.has(jid)) {
               const cmap = counts.get(jid);
               // If any contact has >= 2 lines in this journal
               for (const [cid, c] of cmap.entries()) {
                   if (c >= 2) {
                       doublePayments.push(p.data?.number);
                       break;
                   }
               }
           }
       }
    }
    
    // We just want a sample list for the user
    if (doublePayments.length > 30) {
        break;
    }
    
    page++;
  }

  console.log(`Found ${doublePayments.length} affected payments. List:`);
  console.log(doublePayments.join(', '));
}
run();
