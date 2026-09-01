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
    console.log("Auth failed, doing unauthenticated (will fail RPC)", e1.message);
  } else {
    console.log("Authed.");
  }
  
  const { data: loans } = await supabase.from('docs_loans').select('id, data').limit(1);
  if (loans && loans.length > 0) {
    const loanId = loans[0].id;
    console.log('Testing loan:', loanId);
    const { data, error } = await supabase.rpc('post_loan_payment_rpc', {
      p_loan_id: loanId,
      p_period: 2,
      p_date: new Date().toISOString(),
      p_interest_to_pay: 0,
      p_principal_to_pay: 0
    });
    console.log('RPC result:', data, error);
  }
}
run();
