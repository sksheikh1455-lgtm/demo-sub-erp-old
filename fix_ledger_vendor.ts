import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const billId = 'c03e7bad-ef18-4e2b-9e31-1c6ad32b53c1';
  const newContactId = '32a9861d-2370-435d-ac2f-35cad5a4e685';

  const { data: bills } = await supabase.from('docs_bills').select('id, data').eq('id', billId);
  const bill = bills[0];

  const newData = { 
    ...bill.data, 
    contactId: newContactId, 
    contact_id: newContactId,
    vendorId: newContactId,
    vendor_id: newContactId
  };

  const { error: err1 } = await supabase.from('docs_bills').update({ data: newData }).eq('id', billId);
  console.log("Bill update error:", err1);

  const jId = bill.data?.journalEntryId;
  const { error: err2 } = await supabase.from('docs_journal_lines').update({ contact_id: newContactId }).eq('journal_id', jId);
  console.log("Journal lines update error:", err2);

}
run();
