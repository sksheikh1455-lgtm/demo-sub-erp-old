import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://buspgzsamhfmjrmmwpmo.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM');

async function run() {
  const { data, error } = await supabase.from('docs_contacts').select('id, name, type, data').eq('type', 'EMPLOYEE');
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
run();
