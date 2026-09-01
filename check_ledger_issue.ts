import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  // Check Bill
  const { data: bills } = await supabase.from('docs_bills').select('id, data, contact_id').eq('data->>number', 'BILL-SUL-000213');
  console.log("Bill:", JSON.stringify(bills, null, 2));

  // Check Journal Lines for the bill's journal
  if (bills && bills.length > 0) {
     const jId = bills[0].data?.journalEntryId;
     const { data: lines } = await supabase.from('docs_journal_lines').select('id, contact_id, account_id, debit, credit').eq('journal_id', jId);
     console.log("Journal Lines:", JSON.stringify(lines, null, 2));
     
     // Check if there are any payments applied to this bill
     const { data: payments } = await supabase.from('docs_payments').select('id, data, status').contains('data->applied_bills', [{ billId: bills[0].id }]);
     console.log("Payments applied to this bill:", JSON.stringify(payments, null, 2));
  }
}
run();
