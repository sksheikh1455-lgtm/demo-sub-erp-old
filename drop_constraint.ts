import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: d1 } = await supabase.rpc('execute_sql', { sql: "ALTER TABLE docs_journals DROP CONSTRAINT IF EXISTS unq_journal_num_company;" });
  const { data: d2 } = await supabase.rpc('execute_sql', { sql_string: "ALTER TABLE docs_journals DROP CONSTRAINT IF EXISTS unq_journal_num_company;" });
  console.log(d1, d2);
}
run();
