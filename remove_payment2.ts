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
  const { data: payments, error: findErr } = await supabase
    .from('docs_payments')
    .select('id, data')
    .eq('data->>number', targetNumber);

  if (findErr) {
    console.error("Error finding payment:", findErr);
    return;
  }

  if (!payments || payments.length === 0) {
    console.log(`Payment ${targetNumber} not found.`);
    return;
  }

  const payment = payments[0];
  const paymentId = payment.id;
  const journalId = payment.data?.journalEntryId;
  
  console.log(`Found Payment ID: ${paymentId}`);
  console.log(`Associated Journal ID: ${journalId}`);

  // 2. Delete Journal Lines
  if (journalId) {
    const { error: lineErr } = await supabase
      .from('docs_journal_lines')
      .delete()
      .eq('journal_id', journalId);
      
    if (lineErr) console.error("Error deleting journal lines:", lineErr);
    else console.log(`Deleted journal lines for ${journalId}`);
    
    // Some systems also have a docs_journals table, let's try to delete it just in case
    const { error: jErr } = await supabase
      .from('docs_journals')
      .delete()
      .eq('id', journalId);
    if (jErr && jErr.code !== '42P01') console.error("Error deleting journal:", jErr);
    else if (!jErr) console.log(`Deleted journal header ${journalId}`);
  }

  // 3. Delete Payment
  const { error: delPayErr } = await supabase
    .from('docs_payments')
    .delete()
    .eq('id', paymentId);
    
  if (delPayErr) {
    console.error("Error deleting payment:", delPayErr);
  } else {
    console.log(`Successfully deleted payment ${targetNumber}`);
  }
}
run();
