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
  
  let count = 0;
  const payNumbers = [];
  for (const [jid, lns] of jmap.entries()) {
      if (lns.length >= 2 && jid.includes('PAY')) {
         const hasCash = lns.some(l => l.account_id.includes('-1001'));
         const hasARAP = lns.some(l => l.account_id.includes('-1002') || l.account_id.includes('-2001'));
         if (hasCash && hasARAP) {
            // Found one that has both Cash and AR/AP with contact_id
            count++;
            const { data: p } = await supabase.from('docs_payments').select('data').eq('data->>journalEntryId', jid).maybeSingle();
            if (p && p.data?.number) payNumbers.push(p.data.number);
         }
      }
  }
  
  console.log(`Found ${count} payments. Sample:`, payNumbers.slice(0, 20));
}
run();
