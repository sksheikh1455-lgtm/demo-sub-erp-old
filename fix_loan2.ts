import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: user, error: e1 } = await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('post_loan_payment_rpc', {
    p_loan_id: 'loan-op-fix-5a957f4d',
    p_period: 1,
    p_date: dateStr,
    p_interest_to_pay: 0,
    p_principal_to_pay: 350000
  });

  console.log('Payment RPC Result:', rpcRes, rpcErr);
}
run();
