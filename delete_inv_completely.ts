import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const term = '%010436%';
  let targetInvoice = null;
  
  const { data: invoices } = await supabase.from('docs_invoices').select('id, data').ilike('data->>invoiceNumber', term);
  if (invoices && invoices.length > 0) targetInvoice = invoices[0];
  
  if (!targetInvoice) {
      const { data: invoices2 } = await supabase.from('docs_invoices').select('id, data').ilike('data->>number', term);
      if (invoices2 && invoices2.length > 0) targetInvoice = invoices2[0];
  }

  if (!targetInvoice) {
      console.log("Invoice not found in docs_invoices.");
      return;
  }

  console.log("Deleting invoice:", targetInvoice.data.number || targetInvoice.data.invoiceNumber);

  const invoiceId = targetInvoice.id;
  const journalId = targetInvoice.data.journalEntryId || targetInvoice.data.journal_entry_id;

  if (journalId) {
      const { error: e1 } = await supabase.from('docs_journal_lines').delete().eq('journal_id', journalId);
      console.log("Delete journal lines:", e1 || "Success");
      const { error: e2 } = await supabase.from('docs_journals').delete().eq('id', journalId);
      console.log("Delete journal:", e2 || "Success");
  }

  const { error: e3 } = await supabase.from('docs_invoices').delete().eq('id', invoiceId);
  console.log("Delete invoice:", e3 || "Success");
}
run();
