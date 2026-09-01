import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: lines } = await supabase.from('docs_journal_lines').select('journal_id, contact_id, account_id').not('contact_id', 'is', null);
  
  const jmap = new Map();
  lines?.forEach(l => {
      if (!l.journal_id) return;
      if (!jmap.has(l.journal_id)) jmap.set(l.journal_id, []);
      jmap.get(l.journal_id).push(l);
  });
  
  const doubles = [];
  for (const [jid, lns] of jmap.entries()) {
      if (lns.length > 1 && jid.includes('PAY')) {
         const uniqueContacts = new Set(lns.map((x:any) => x.contact_id));
         if (uniqueContacts.size === 1) {
            // It has multiple lines for the SAME contact in a PAYMENT journal
            doubles.push(jid);
         }
      }
  }
  
  console.log(`Found ${doubles.length} payment journals with double lines.`);
  // fetch some numbers
  if (doubles.length > 0) {
      const { data: pays } = await supabase.from('docs_payments').select('data').in('data->>journalEntryId', doubles);
      console.log("Some payment numbers:", pays?.slice(0, 10).map(p => p.data?.number).join(', '));
  }
}
run();
