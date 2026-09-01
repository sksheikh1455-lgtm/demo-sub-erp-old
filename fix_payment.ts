import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const targetNumber = "PAY-SUL-178997973";
  
  // 1. Find the payment
  const { data: payments } = await supabase
    .from('docs_payments')
    .select('id, data')
    .eq('data->>number', targetNumber);

  if (!payments || payments.length === 0) return console.log("Not found.");
  
  const payment = payments[0];
  const paymentId = payment.id;
  const journalId = payment.data?.journalEntryId;
  
  console.log(`Found Payment ID: ${paymentId}`);

  // Delete journal lines
  if (journalId) {
    await supabase.from('docs_journal_lines').delete().eq('journal_id', journalId);
    await supabase.from('docs_journals').delete().eq('id', journalId);
  }

  // Soft delete payment (so the frontend sync doesn't re-upload a missing record, but instead syncs the DELETED status)
  const newData = { ...payment.data, status: 'DELETED' };
  const { error } = await supabase
    .from('docs_payments')
    .update({ data: newData })
    .eq('id', paymentId);
    
  if (error) console.error(error);
  else console.log("Successfully marked payment as DELETED in Supabase.");
}
run();
