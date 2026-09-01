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

}
run();
