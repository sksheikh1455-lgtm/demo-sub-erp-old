import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: bills } = await supabase.from('docs_bills').select('id, data, contact_id').eq('id', 'c03e7bad-ef18-4e2b-9e31-1c6ad32b53c1');
  console.log("Bill by ID:", JSON.stringify(bills, null, 2));

  if (bills && bills.length > 0) {
     const jId = bills[0].data?.journalEntryId;
     const { data: lines } = await supabase.from('docs_journal_lines').select('id, contact_id, account_id, debit, credit').eq('journal_id', jId);
     console.log("Journal Lines:", JSON.stringify(lines, null, 2));
  }
}
run();
