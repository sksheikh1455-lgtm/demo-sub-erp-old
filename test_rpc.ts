import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });
  
  const rpcParams: any = {
      p_company_ids: ['comp-1'],
      p_start_date: '1970-01-01',
      p_end_date: '2099-12-31',
      p_partner_ids: ['32a9861d-2370-435d-ac2f-35cad5a4e685']
  };

  const { data, error } = await supabase.rpc('get_general_ledger', rpcParams);
  
  if (data) {
     const entries = data.filter((d: any) => d.reference_number === 'BILL-SUL-000213' || d.description?.includes('000213'));
     console.log("Found for Click:", entries);
  } else {
     console.log("Error:", error);
  }
}
run();
