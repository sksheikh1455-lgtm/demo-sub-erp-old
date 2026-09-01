import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: pay } = await supabase.from('docs_payments').select('id, data, contact_id').eq('id', 'afe12c80-ad97-42f8-9a47-a2a4fbdb91a1');
  console.log(JSON.stringify(pay, null, 2));
  
  if (pay?.length === 0) {
      // maybe search by number
      const { data: pay2 } = await supabase.from('docs_payments').select('id, data, contact_id').ilike('data->>paymentNumber', '%178996798%');
      console.log(JSON.stringify(pay2, null, 2));
      const { data: pay3 } = await supabase.from('docs_payments').select('id, data, contact_id').ilike('data->>number', '%178996798%');
      console.log(JSON.stringify(pay3, null, 2));
  }
}
run();
