import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const invoiceId = '14604e5b-4d20-443c-8304-fcc52c598cc6';
  const { data: inv } = await supabase.from('docs_invoices').select('id, data').eq('id', invoiceId).single();
  if (inv) {
      const newData = { ...inv.data, _forceSync: new Date().toISOString() };
      // Some properties might be stored in the top level. Let's force an update just so the client syncs.
      await supabase.from('docs_invoices').update({ data: newData, updated_at: new Date().toISOString() }).eq('id', invoiceId);
      console.log("Forced update on invoice");
  }
}
run();
