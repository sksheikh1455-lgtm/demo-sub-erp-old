import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://buspgzsamhfmjrmmwpmo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM"
);

async function find() {
  const { data: contacts } = await supabase.from('docs_contacts').select('id, name, type').ilike('name', '%ibrahim%');
  console.log("Contacts matching ibrahim:", contacts);

  const { data: custSummary } = await supabase.rpc('get_partner_summary', {
    p_company_ids: ['comp-1'],
    p_contact_type: 'CUSTOMER'
  });
  console.log("Total cust in summary:", custSummary?.length);
  contacts.forEach(c => {
    const s = custSummary.find(r => r.contact_id === c.id);
    console.log(`Summary for ${c.name} (${c.id}):`, s);
  });
}
find();
