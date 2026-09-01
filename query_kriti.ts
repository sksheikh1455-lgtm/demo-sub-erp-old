import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: contacts, error } = await supabase.from('docs_contacts').select('*').ilike('name', '%KRITI%');
  console.log('Contacts:', contacts?.map(c => ({id: c.id, name: c.name, type: c.type, isVendor: c.data?.isVendor, isCustomer: c.data?.isCustomer})));
  
  if (contacts && contacts.length > 0) {
    const contactId = contacts[0].id;
    // Let's check Bills for this contact
    const { data: bills } = await supabase.from('docs_bills').select('id, data').eq('data->>vendorId', contactId);
    console.log('Bills as Vendor:', bills?.length);

    // Let's check Journals for this contact
    const { data: journals } = await supabase.from('docs_journals').select('id, data').limit(100);
    // Actually, we can check journal_lines but we don't have direct access in supabase to query nested json easily or we can just fetch all and filter.
    // Or we can query the pg directly, but the earlier query_pg failed.
  }
}
run();
