import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const paymentId = '0e9c1fa6-9eb1-4276-8865-4f638a77dbb2';
  const journalId = 'JE-PAY-0E9C1FA6-9EB1-4276-8865-4F638A77DBB2';
  const now = new Date().toISOString();

  console.log("Zeroing out journal lines...");
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

  console.log("Voiding Payment...");
  const { data: pay } = await supabase.from('docs_payments').select('data').eq('id', paymentId).single();
  if (pay) {
      const newPayData = { ...pay.data, status: 'VOID', _forceSync: now };
      await supabase.from('docs_payments').update({ data: newPayData, status: 'VOID', updated_at: now }).eq('id', paymentId);
      console.log("Voided Payment.");
  }
}
run();
