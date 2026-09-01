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
  const { data: lines } = await supabase.from('docs_journal_lines').select('journal_id, debit, credit, description').eq('contact_id', contactId).eq('account_id', 'comp-1-200101');
  console.log(lines);
  
  for (const l of lines || []) {
      const { data: j } = await supabase.from('docs_journals').select('data').eq('id', l.journal_id).single();
      console.log('Journal:', JSON.stringify(j, null, 2));
  }
}
run();
