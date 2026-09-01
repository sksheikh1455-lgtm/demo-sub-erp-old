import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: accounts } = await supabase.from('docs_accounts').select('id, data').eq('id', 'comp-1-100201');
  console.log('Account 100201:', accounts?.[0]?.data);

  const { data: allAccounts } = await supabase.from('docs_accounts').select('id, data').limit(100);
  const ar = allAccounts?.find(a => a.data?.type === 'RECEIVABLE');
  const ap = allAccounts?.find(a => a.data?.type === 'PAYABLE');
  console.log('AR account:', ar?.id, ar?.data?.name);
  console.log('AP account:', ap?.id, ap?.data?.name);
}
run();
