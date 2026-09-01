import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  const { data: loans } = await supabase.from('docs_loans').select('id, data').ilike('loan_number', '%OP-LOAN-2494%');
  if (!loans || loans.length === 0) {
    console.log('Loan not found');
    return;
  }
  
  const loan = loans[0];
  console.log('Found loan:', loan);
  
  const updatedData = {
    ...loan.data,
    type: 'RECEIVED'
  };

  const { data, error } = await supabase.from('docs_loans').update({
    type: 'RECEIVED',
    data: updatedData
  }).eq('id', loan.id).select();
  
  console.log('Update Result:', data, error);

  // Now process the payment via our backend's logic or directly using supabase rpc
  // Wait, let's use the RPC function `post_loan_payment_rpc` we saw earlier!
  const dateStr = new Date().toISOString().split('T')[0];
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('post_loan_payment_rpc', {
    p_loan_id: loan.id,
    p_period: 1, // Pay off period 1
    p_date: dateStr,
    p_interest_to_pay: 0
  });

  console.log('Payment RPC Result:', rpcRes, rpcErr);
}
run();
