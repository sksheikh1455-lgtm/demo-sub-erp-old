import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const now = new Date().toISOString();

  // Force update updated_at on bill
  await supabase.from('docs_bills').update({ updated_at: now }).eq('id', 'c03e7bad-ef18-4e2b-9e31-1c6ad32b53c1');
  
  // Force update updated_at on journal and journal_lines
  const jId = 'JE-C03E7BAD-EF18-4E2B-9E31-1C6AD32B53C1';
  await supabase.from('docs_journals').update({ updated_at: now }).eq('id', jId);
  await supabase.from('docs_journal_lines').update({ updated_at: now }).eq('journal_id', jId);
  
  console.log("Updated timestamps to force client sync!");
}
run();
