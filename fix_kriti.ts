import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const contactId = '5f9bf155-2cb0-4817-b7df-4f9b053724d9';
  
  // Update journal line
  const { data: updated, error } = await supabase.from('docs_journal_lines')
    .update({ account_id: 'comp-1-100201' })
    .eq('journal_id', 'JE-PAY-REF-AFE12C80-AD97-42F8-9A47-A2A4FBDB91A1')
    .eq('account_id', 'comp-1-200101')
    .select();
    
  console.log('Updated:', updated, error);
}
run();
