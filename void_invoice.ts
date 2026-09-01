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
  console.log("Searching for invoice:", term);
  
  const { data: invoices } = await supabase.from('docs_invoices').select('id, data, status').ilike('data->>invoiceNumber', term);
  
  let targetInvoice = invoices && invoices.length > 0 ? invoices[0] : null;
  if (!targetInvoice) {
      const { data: invoices2 } = await supabase.from('docs_invoices').select('id, data, status').ilike('data->>number', term);
      targetInvoice = invoices2 && invoices2.length > 0 ? invoices2[0] : null;
  }

  if (!targetInvoice) {
      console.log("Invoice not found!");
      return;
  }

  console.log("Found Invoice:", targetInvoice.data.number || targetInvoice.data.invoiceNumber);

  const invoiceId = targetInvoice.id;
  const journalId = targetInvoice.data.journalEntryId || targetInvoice.data.journal_entry_id;
  const now = new Date().toISOString();

  if (journalId) {
      console.log("Zeroing out journal lines for journal:", journalId);
      const { data: lines } = await supabase.from('docs_journal_lines').select('id').eq('journal_id', journalId);
      if (lines && lines.length > 0) {
          for (const line of lines) {
              await supabase.from('docs_journal_lines').update({ debit: 0, credit: 0, updated_at: now }).eq('id', line.id);
          }
          console.log(`Zeroed out ${lines.length} lines.`);
      }

      console.log("Voiding Journal...");
      const { data: oj } = await supabase.from('docs_journals').select('data').eq('id', journalId).single();
      if (oj) {
          const newOjData = { ...oj.data, status: 'VOID', _forceSync: now };
          await supabase.from('docs_journals').update({ data: newOjData, status: 'VOID', updated_at: now }).eq('id', journalId);
          console.log("Voided Journal.");
      }
  } else {
      console.log("No associated journal entry found in invoice data.");
  }

  console.log("Voiding Invoice...");
  const newInvData = { ...targetInvoice.data, status: 'VOID', _forceSync: now };
  await supabase.from('docs_invoices').update({ data: newInvData, status: 'VOID', updated_at: now }).eq('id', invoiceId);
  console.log("Voided Invoice.");
}
run();
