import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const revJournalId = '12e36780-5ee3-4f1e-819c-64f3ebfd34a3';

  // 1. Delete Reversal Journal Lines
  const { error: err1 } = await supabase.from('docs_journal_lines').delete().eq('journal_id', revJournalId);
  console.log("Delete Rev Lines Error:", err1);

  // 2. Delete Reversal Journal
  const { error: err2 } = await supabase.from('docs_journals').delete().eq('id', revJournalId);
  console.log("Delete Rev Journal Error:", err2);

  // 3. Optional: we might want to check the original bill and journal to make sure they are active or decide to delete them too.
  const { data: bill } = await supabase.from('docs_bills').select('id, data').eq('id', '4721e02f-7558-4f79-8664-b644f1c7c714').single();
  if (bill && bill.data.status === 'VOID') {
     // Revert original bill to POSTED
     const newData = { ...bill.data, status: 'POSTED' };
     await supabase.from('docs_bills').update({ data: newData }).eq('id', bill.id);
     
     // Revert original journal to POSTED
     const origJournalId = 'JE-4721E02F-7558-4F79-8664-B644F1C7C714';
     const { data: oj } = await supabase.from('docs_journals').select('data').eq('id', origJournalId).single();
     if (oj) {
         const newOjData = { ...oj.data, status: 'POSTED' };
         await supabase.from('docs_journals').update({ data: newOjData }).eq('id', origJournalId);
     }
     console.log("Reverted original bill and journal to POSTED.");
  }

}
run();
