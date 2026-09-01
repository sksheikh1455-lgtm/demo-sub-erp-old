import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: pay } = await supabase.from('docs_payments').select('id, data').ilike('data->>number', '%001207%');
  console.log(JSON.stringify(pay, null, 2));

  if (pay && pay.length > 0) {
     const jid = pay[0].data.journalEntryId;
     console.log(`Journal ID: ${jid}`);
     const { data: lines } = await supabase.from('docs_journal_lines').select('*').eq('journal_id', jid);
     console.log("Journal Lines:", JSON.stringify(lines, null, 2));
     
     const { data: ledger } = await supabase.rpc('get_general_ledger', { p_company_ids: [lines[0].company_id], p_partner_ids: [lines[0].contact_id] });
     console.log("RPC returned for this journal:", ledger?.filter(l => l.journal_id === jid));
  }
}
run();
