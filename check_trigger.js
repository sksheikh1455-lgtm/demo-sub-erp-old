const { createClient } = require('@supabase/supabase-js');
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_statement: `SELECT trigger_name, event_object_table, action_statement FROM information_schema.triggers WHERE event_object_table IN ('docs_invoice_lines', 'docs_invoices');`
  });
  console.log(JSON.stringify(data, null, 2));
}
run();
