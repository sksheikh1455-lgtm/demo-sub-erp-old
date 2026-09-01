import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const contactId = '5f9bf155-2cb0-4817-b7df-4f9b053724d9';
  const { data: lines } = await supabase.from('docs_journal_lines').select('*').eq('contact_id', contactId);
  
  let totalDebit = 0;
  let totalCredit = 0;
  
  const accMap = new Map<string, {d: number, c: number}>();
  
  lines?.forEach(l => {
     totalDebit += Number(l.debit);
     totalCredit += Number(l.credit);
     
     if (!accMap.has(l.account_id)) accMap.set(l.account_id, {d:0, c:0});
     const st = accMap.get(l.account_id)!;
     st.d += Number(l.debit);
     st.c += Number(l.credit);
  });
  
  console.log(`Total DR: ${totalDebit}, CR: ${totalCredit}`);
  console.log(accMap);
  
  const { data: acc } = await supabase.from('docs_accounts').select('id, data').in('id', Array.from(accMap.keys()));
  console.log(acc?.map(a => ({id: a.id, name: a.data?.name, type: a.data?.type})));
}
run();
