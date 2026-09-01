import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  // 1. Find the new contact "CLICK ELECTRICAL ACCESSORIES"
  const { data: contacts } = await supabase
    .from('docs_contacts')
    .select('id, name, data')
    .ilike('name', '%CLICK ELECTRICAL ACCESSORIES%');

  if (!contacts || contacts.length === 0) {
    console.log("Could not find contact 'CLICK ELECTRICAL ACCESSORIES'");
    return;
  }
  
  const newContact = contacts[0];
  const newContactId = newContact.id;
  console.log(`Found New Contact: ${newContact.name} (ID: ${newContactId})`);

  // 2. Find the bill
  const billNumber = "BILL-SUL-000213";
  const { data: bills } = await supabase
    .from('docs_bills')
    .select('id, data')
    .eq('data->>number', billNumber);

  if (!bills || bills.length === 0) {
    console.log(`Could not find bill with number ${billNumber}`);
    return;
  }

  const bill = bills[0];
  const billId = bill.id;
  const journalId = bill.data?.journalEntryId;
  const oldContactId = bill.data?.contactId || bill.data?.contact_id;
  
  console.log(`Found Bill: ${billId}`);
  console.log(`Old Contact ID: ${oldContactId}`);
  console.log(`Associated Journal ID: ${journalId}`);

  // 3. Update the bill
  const newData = { ...bill.data, contactId: newContactId, contact_id: newContactId };
  const { error: updateBillErr } = await supabase
    .from('docs_bills')
    .update({ data: newData })
    .eq('id', billId);
    
  if (updateBillErr) {
    console.error("Error updating bill:", updateBillErr);
  } else {
    console.log("Successfully updated bill vendor.");
  }

  // 4. Update the journal lines
  if (journalId) {
    const { data: lines } = await supabase
      .from('docs_journal_lines')
      .select('id, contact_id')
      .eq('journal_id', journalId);
      
    if (lines && lines.length > 0) {
       for (const line of lines) {
         if (line.contact_id === oldContactId || !line.contact_id) {
           await supabase.from('docs_journal_lines').update({ contact_id: newContactId }).eq('id', line.id);
         }
       }
       console.log("Successfully updated journal lines with new contact ID.");
    }
  }
}
run();
