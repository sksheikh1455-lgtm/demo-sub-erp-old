import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const term = '%000242%';
  console.log("Searching for Bill:", term);
  
  const { data: bills } = await supabase.from('docs_bills').select('id, data, status').ilike('data->>billNumber', term);
  
  let targetBill = bills && bills.length > 0 ? bills[0] : null;
  if (!targetBill) {
      const { data: bills2 } = await supabase.from('docs_bills').select('id, data, status').ilike('data->>number', term);
      targetBill = bills2 && bills2.length > 0 ? bills2[0] : null;
  }

  if (targetBill) {
      console.log("Bill Status:", targetBill.status);
      console.log("Bill Data Status:", targetBill.data.status);
      console.log("Bill Total:", targetBill.data.total);
      console.log("Bill Amount Due/Paid:", targetBill.data.amountDue, targetBill.data.amountPaid);
      console.log("Applied Payments:", targetBill.data.appliedPayments);
      
      const billId = targetBill.id;
      
      // Look for payments referencing this bill
      const { data: payments } = await supabase.from('docs_payments').select('id, data, status').contains('data', { appliedInvoices: [{ invoiceId: billId }] });
      console.log("\nPayments applying to this bill (using appliedInvoices -> invoiceId array):", payments ? payments.length : 0);
      if (payments) {
          payments.forEach(p => console.log(`Payment: ${p.id} | Status: ${p.status} | Data Status: ${p.data.status}`));
      }
      
      // Look for payments where data->>billId matches (if they use different schema)
      const { data: payments2 } = await supabase.from('docs_payments').select('id, data, status').eq('data->>billId', billId);
      console.log("Payments (by billId):", payments2 ? payments2.length : 0);
      if (payments2) {
          payments2.forEach(p => console.log(`Payment: ${p.id} | Status: ${p.status} | Data Status: ${p.data.status}`));
      }

      // Check journals for this bill
      const { data: journals } = await supabase.from('docs_journals').select('id, reference_number, status').ilike('reference_number', `%${targetBill.data.number || targetBill.data.billNumber}%`);
      console.log("\nJournals related to this bill:", journals);

  } else {
      console.log("Bill not found.");
  }
}
run();
