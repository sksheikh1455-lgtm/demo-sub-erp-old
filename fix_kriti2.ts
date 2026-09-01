import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  // Change journal to DRAFT
  const { data: j1, error: e1 } = await supabase.from('docs_journals')
    .update({ data: { status: 'DRAFT', sourceId: "PAY-REF-afe12c80-ad97-42f8-9a47-a2a4fbdb91a1" } })
    .eq('id', 'JE-PAY-REF-AFE12C80-AD97-42F8-9A47-A2A4FBDB91A1')
    .select();
  console.log('Update journal to DRAFT:', e1);

  // Update line
  const { data: updated, error } = await supabase.from('docs_journal_lines')
    .update({ account_id: 'comp-1-100201' })
    .eq('journal_id', 'JE-PAY-REF-AFE12C80-AD97-42F8-9A47-A2A4FBDB91A1')
    .eq('account_id', 'comp-1-200101')
    .select();
  console.log('Update line:', updated, error);

  // Change journal to POSTED
  const { data: j2, error: e2 } = await supabase.from('docs_journals')
    .update({ data: { status: 'POSTED', sourceId: "PAY-REF-afe12c80-ad97-42f8-9a47-a2a4fbdb91a1" } })
    .eq('id', 'JE-PAY-REF-AFE12C80-AD97-42F8-9A47-A2A4FBDB91A1')
    .select();
  console.log('Update journal to POSTED:', e2);
}
run();
