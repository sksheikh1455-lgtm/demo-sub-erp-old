import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://buspgzsamhfmjrmmwpmo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM"
);

async function check() {
  const cid = 'c632b3b2-1646-4f45-a07b-311236b31710';
  const { data: lines } = await supabase.from('docs_journal_lines')
    .select('id, journal_id, account_id, debit, credit, description')
    .eq('contact_id', cid);
  
  const { data: accounts } = await supabase.from('docs_accounts').select('id, code, name');
  const accMap = new Map();
  accounts?.forEach(a => accMap.set(a.id, `${a.code} - ${a.name}`));

  lines?.forEach(l => {
    const acc = accMap.get(l.account_id) || l.account_id;
    console.log(`line: ${l.id.padEnd(50)} | acc: ${acc?.padEnd(35)} | DR: ${String(l.debit).padStart(10)} | CR: ${String(l.credit).padStart(10)} | desc: ${l.description}`);
  });
}
check();
