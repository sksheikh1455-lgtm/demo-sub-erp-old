import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: jLines } = await supabase.from('docs_journal_lines').select('*').eq('journal_id', '12e36780-5ee3-4f1e-819c-64f3ebfd34a3');
  console.log("Reversal Journal Lines:", JSON.stringify(jLines, null, 2));

  const { data: bill } = await supabase.from('docs_bills').select('id, data, status').eq('id', '4721e02f-7558-4f79-8664-b644f1c7c714');
  console.log("Original Bill:", JSON.stringify(bill, null, 2));
}
run();
