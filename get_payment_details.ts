import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: contacts } = await supabase.from('docs_contacts').select('id, data').ilike('data->>name', '%EXCEL TECHNOLOGIES%');
  console.log('Target Vendors:', contacts?.map(c => ({ id: c.id, name: c.data?.name })));

  const { data: payments } = await supabase.from('docs_payments').select('id, data, contact_id').eq('data->>number', 'PAY-SUL-178997690');
  console.log('Target Payment:', JSON.stringify(payments, null, 2));
}
run();
