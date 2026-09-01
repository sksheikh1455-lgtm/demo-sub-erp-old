import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const billId = '08dacf6d-e93c-4428-9a04-31aa12ced332';
  const { data: bill } = await supabase.from('docs_bills').select('data').eq('id', billId).single();
  
  if (bill) {
      const now = new Date().toISOString();
      const newData = { ...bill.data, status: 'POSTED', _forceSync: now };
      
      const { error } = await supabase.from('docs_bills').update({ 
          data: newData, 
          status: 'POSTED', 
          updated_at: now 
      }).eq('id', billId);
      
      console.log("Reverted bill status to POSTED. Error:", error);
  }
}
run();
