import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const term = '%178998248%';

  console.log("Searching payments...");
  const { data: payments } = await supabase.from('docs_payments').select('id, data, status').ilike('data->>number', term);
  console.log("Payments:", JSON.stringify(payments, null, 2));

  console.log("Searching journals...");
  const { data: journals } = await supabase.from('docs_journals').select('id, reference_number, journal_type, data, status').ilike('reference_number', term);
  console.log("Journals by reference:", JSON.stringify(journals, null, 2));
  
  const { data: journalsDesc } = await supabase.from('docs_journals').select('id, reference_number, journal_type, data, status').ilike('description', term);
  console.log("Journals by description:", JSON.stringify(journalsDesc, null, 2));
}
run();
