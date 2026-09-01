import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: journal } = await supabase
    .from('docs_journals')
    .select('*')
    .eq('id', 'JE-PAY-A3F12E94-7174-46A6-A940-483339C9DD03');
    
  const { data: lines } = await supabase
    .from('docs_journal_lines')
    .select('*')
    .eq('journal_id', 'JE-PAY-A3F12E94-7174-46A6-A940-483339C9DD03');

  console.log("Journals in DB:", journal);
  console.log("Journal Lines in DB:", lines);
}
run();
