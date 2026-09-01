import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: bill } = await supabase.from('docs_bills').select('id, data, status').eq('id', '4721e02f-7558-4f79-8664-b644f1c7c714').single();
  console.log("Original Bill Status:", bill?.status, "Data Status:", bill?.data?.status);
  
  if (bill && bill.data.status !== 'POSTED') {
     const newData = { ...bill.data, status: 'POSTED', _forceSync: new Date().toISOString() };
     await supabase.from('docs_bills').update({ data: newData, status: 'POSTED' }).eq('id', bill.id);
     console.log("Forced update to POSTED");
  }

  const origJournalId = 'JE-4721E02F-7558-4F79-8664-B644F1C7C714';
  const { data: oj } = await supabase.from('docs_journals').select('id, data, status').eq('id', origJournalId).single();
  console.log("Original Journal Status:", oj?.status, "Data Status:", oj?.data?.status);

  if (oj && oj.data.status !== 'POSTED') {
      const newOjData = { ...oj.data, status: 'POSTED', _forceSync: new Date().toISOString() };
      await supabase.from('docs_journals').update({ data: newOjData, status: 'POSTED' }).eq('id', origJournalId);
      console.log("Forced update journal to POSTED");
  }
}
run();
