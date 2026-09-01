import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const exactTerm = 'BILL-SUL-000242';
  console.log("Searching exactly for Bill:", exactTerm);
  
  const { data: bills } = await supabase.from('docs_bills').select('id, data, status').eq('data->>number', exactTerm);
  
  if (bills && bills.length > 0) {
      const targetBill = bills[0];
      console.log("Bill ID:", targetBill.id);
      console.log("Bill Status:", targetBill.status);
      console.log("Bill Data Status:", targetBill.data.status);
      console.log("Bill Total:", targetBill.data.total);
      console.log("Bill Amount Due/Paid:", targetBill.data.amountDue, targetBill.data.amountPaid);
      console.log("Applied Payments:", JSON.stringify(targetBill.data.appliedPayments));
      
      const billId = targetBill.id;
      
      const { data: payments } = await supabase.from('docs_payments').select('id, data, status').contains('data', { appliedInvoices: [{ invoiceId: billId }] });
      console.log("\nPayments applying to this bill (using appliedInvoices -> invoiceId array):", payments ? payments.length : 0);
      if (payments) {
          payments.forEach(p => console.log(`Payment: ${p.id} | Status: ${p.status} | Data Status: ${p.data.status}`));
      }
      
      const { data: payments2 } = await supabase.from('docs_payments').select('id, data, status').eq('data->>billId', billId);
      console.log("Payments (by billId):", payments2 ? payments2.length : 0);
      if (payments2) {
          payments2.forEach(p => console.log(`Payment: ${p.id} | Status: ${p.status} | Data Status: ${p.data.status}`));
      }
      
      // Let's just search all payments for this billId anywhere in their data
      const { data: allP } = await supabase.from('docs_payments').select('id, data, status').or(`data->>appliedTo.ilike.%${billId}%, data->>invoiceId.eq.${billId}`);
      console.log("All matching payments (loose string match):", allP ? allP.length : 0);
      
      const { data: journals } = await supabase.from('docs_journals').select('id, reference_number, status').ilike('reference_number', `%${exactTerm}%`);
      console.log("\nJournals related to this bill exact match:", journals);
  } else {
      console.log("Bill not found.");
  }
}
run();
