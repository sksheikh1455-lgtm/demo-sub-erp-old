import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: contacts } = await supabase.from('docs_contacts').select('id, data').ilike('data->>name', '%FORAZI%');
  console.log('Found FORAZI contacts:', contacts?.map(c => c.data?.name));

  if (contacts && contacts.length > 0) {
    for (const c of contacts) {
      const { data: wrongLines } = await supabase.from('docs_journal_lines')
        .select('*')
        .eq('contact_id', c.id)
        .like('account_id', '%-2001%');
      
      console.log(`Wrong AP lines for ${c.data?.name}:`, wrongLines?.length);
      if (wrongLines && wrongLines.length > 0) {
        for (const line of wrongLines) {
          const arAccount = line.account_id.replace('-200100', '-100201').replace('-200101', '-100201');
          console.log(`Fixing journal ${line.journal_id} for ${c.data?.name} from ${line.account_id} to ${arAccount}`);

          const { data: currentJ } = await supabase.from('docs_journals').select('data').eq('id', line.journal_id).single();
          if (currentJ) {
            await supabase.from('docs_journals').update({ data: { ...currentJ.data, status: 'DRAFT' } }).eq('id', line.journal_id);
            await supabase.from('docs_journal_lines').update({ account_id: arAccount }).eq('id', line.id);
            await supabase.from('docs_journals').update({ data: { ...currentJ.data, status: 'POSTED' } }).eq('id', line.journal_id);
            console.log(`Fixed line ${line.id} for ${c.data?.name}`);
          }
        }
      }
    }
  }
}
run();
