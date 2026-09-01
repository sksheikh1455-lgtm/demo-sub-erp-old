import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const names = [
    "MONIR VAI (BANK PARA)",
    "MIM JIM ELECTRIC (MANDARTOLA)",
    "FORAZI ENTERPRISE (RADHAGANJ)",
    "CHAINA BANGLA SANITARY(GOPALGANJ)"
  ];

  for (const name of names) {
    const { data: contacts } = await supabase.from('docs_contacts').select('id, data').ilike('data->>name', `%${name.split('(')[0].trim()}%`);
    if (!contacts || contacts.length === 0) {
      console.log(`Could not find contact for ${name}`);
      continue;
    }
    const contactId = contacts[0].id;
    const companyId = contacts[0].data?.companyId || 'comp-1';
    console.log(`Found ${contacts[0].data?.name} with ID ${contactId}`);

    // find wrong journal lines
    const { data: wrongLines } = await supabase.from('docs_journal_lines')
      .select('*')
      .eq('contact_id', contactId)
      .like('account_id', '%-2001%'); // 200100 or 200101

    if (wrongLines && wrongLines.length > 0) {
      console.log(`Found ${wrongLines.length} wrong lines for ${name}`);
      for (const line of wrongLines) {
        const arAccount = line.account_id.replace('-200100', '-100201').replace('-200101', '-100201');
        
        console.log(`Fixing journal ${line.journal_id} for ${name} from ${line.account_id} to ${arAccount}`);

        // Fetch current journal to preserve data
        const { data: currentJ } = await supabase.from('docs_journals').select('data').eq('id', line.journal_id).single();
        if (currentJ) {
          // Set to draft
          await supabase.from('docs_journals').update({ data: { ...currentJ.data, status: 'DRAFT' } }).eq('id', line.journal_id);
          
          // Update line
          await supabase.from('docs_journal_lines').update({ account_id: arAccount }).eq('id', line.id);
          
          // Set to posted
          await supabase.from('docs_journals').update({ data: { ...currentJ.data, status: 'POSTED' } }).eq('id', line.journal_id);
          
          console.log(`Fixed line ${line.id} for ${name}`);
        }
      }
    } else {
      console.log(`No wrong AP lines found for ${name}`);
    }
  }
}
run();
