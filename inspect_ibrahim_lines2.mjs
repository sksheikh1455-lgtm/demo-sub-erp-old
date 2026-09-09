import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://buspgzsamhfmjrmmwpmo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM"
);

async function check() {
  const cid = 'c632b3b2-1646-4f45-a07b-311236b31710';
  const { data: lines, error } = await supabase.from('docs_journal_lines')
    .select('*')
    .eq('contact_id', cid);
  console.log("Error:", error);
  console.log(`Total lines for Ibrahim: ${lines?.length}`);
  let sumDr = 0, sumCr = 0;
  lines?.forEach(l => {
    const dr = Number(l.debit || 0);
    const cr = Number(l.credit || 0);
    sumDr += dr;
    sumCr += cr;
    console.log(`line: ${l.id}, journal: ${l.journal_id}, dr: ${dr}, cr: ${cr}, desc: ${l.description}`);
  });
  console.log(`Sum DR: ${sumDr}, Sum CR: ${sumCr}, Net (DR-CR): ${sumDr - sumCr}`);
}
check();
