import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: loan } = await supabase.from('docs_loans').select('*').eq('id', 'loan-op-fix-5a957f4d').single();
  if (loan) {
    const updatedData = {
      ...loan.data,
      status: loan.status,
      paidPeriods: loan.paid_periods
    };
    await supabase.from('docs_loans').update({ data: updatedData }).eq('id', loan.id);
    console.log('Fixed inner data');
  }
}
run();
