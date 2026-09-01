import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);
async function run() {
  const { data, error } = await supabase.from('docs_journals').select('id, data').like('id', '%OP-LOAN-2494%');
  console.log('Journals for OP-LOAN-2494:', JSON.stringify(data, null, 2));

  const { data: data2 } = await supabase.from('docs_journals').select('id, data').like('id', '%loan-op-fix-5a957f4d%');
  console.log('Journals for loan-op-fix-5a957f4d:', JSON.stringify(data2, null, 2));
}
run();
