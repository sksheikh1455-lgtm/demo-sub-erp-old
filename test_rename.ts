import { createClient } from '@supabase/supabase-js';
const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(url, key);

async function run() {
  await supabase.auth.signInWithPassword({
    email: "raihansheikh145@gmail.com",
    password: "password"
  });

  const { data: payments } = await supabase
    .from('docs_payments')
    .select('id, data, status')
    .ilike('data->>number', '%178997973%');

  if (payments && payments.length > 0) {
    const payment = payments[0];
    const newData = { ...payment.data, number: 'DELETED-' + payment.data.number, reference: 'DELETED' };
    const { error } = await supabase
      .from('docs_payments')
      .update({ data: newData })
      .eq('id', payment.id);
    console.log("Renamed:", error ? error : "Success");
  }
}
run();
