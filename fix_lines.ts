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

  // Zero out the lines so they don't affect ledger
  const { data: jLines } = await supabase.from('docs_journal_lines').select('id').eq('journal_id', revJournalId);
  if (jLines) {
      for (const line of jLines) {
          await supabase.from('docs_journal_lines').update({ debit: 0, credit: 0 }).eq('id', line.id);
      }
      console.log("Zeroed out", jLines.length, "lines.");
  }

}
run();
