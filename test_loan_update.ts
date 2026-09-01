import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);
async function run() {
  const { data: user, error: e1 } = await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });
  if (e1) {
    console.log("Auth failed, doing unauthenticated", e1.message);
  }
  const { data: loans } = await supabase.from('docs_loans').select('id, paid_periods').limit(1);
  if (loans && loans.length > 0) {
    const loan = loans[0];
    const { data, error } = await supabase.from('docs_loans').update({ paid_periods: loan.paid_periods }).eq('id', loan.id).select();
    console.log('Update result:', data, error);
  }
}
run();
