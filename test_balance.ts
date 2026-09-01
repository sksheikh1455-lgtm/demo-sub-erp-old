import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: b1 } = await supabase.rpc('get_partner_summary', { p_company_ids: ['comp-1'] });
  
  if (b1) {
    const bizli = b1.find(b => b.contact_id === '116fc345-723a-4dba-a53f-81b2dab11605');
    const click = b1.find(b => b.contact_id === '32a9861d-2370-435d-ac2f-35cad5a4e685');
    console.log("Bizli Balance:", bizli?.balance);
    console.log("Click Balance:", click?.balance);
  }
}
run();
