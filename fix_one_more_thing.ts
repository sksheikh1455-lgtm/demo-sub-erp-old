import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const now = new Date().toISOString();

  // One more update just to be absolutely sure the frontend catches it
  const { data: b } = await supabase.from('docs_bills').select('data').eq('id', 'c03e7bad-ef18-4e2b-9e31-1c6ad32b53c1').single();
  if (b) {
     const newData = { ...b.data, _forceSync: now };
     await supabase.from('docs_bills').update({ data: newData, updated_at: now }).eq('id', 'c03e7bad-ef18-4e2b-9e31-1c6ad32b53c1');
  }
}
run();
