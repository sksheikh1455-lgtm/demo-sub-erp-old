import { createClient } from '@supabase/supabase-js';
const supabaseUrl = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('docs_journals').insert([
    { id: 'TEST-5', company_id: 'COMP-X', reference_number: 'REF-X', status: 'DRAFT' },
    { id: 'TEST-6', company_id: 'COMP-X', reference_number: 'REF-X', status: 'DRAFT' }
  ]);
  console.log("Insert docs_journals error:", error?.message);

  const { data: d2, error: e2 } = await supabase.from('docs_payments').insert([
    { id: 'TEST-5', company_id: 'COMP-X', payment_number: 'REF-X', status: 'DRAFT', data: {} },
    { id: 'TEST-6', company_id: 'COMP-X', payment_number: 'REF-X', status: 'DRAFT', data: {} }
  ]);
  console.log("Insert docs_payments error:", e2?.message);
}
main();
