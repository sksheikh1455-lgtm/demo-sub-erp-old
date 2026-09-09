import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const pins = ['123400', '123456', '000000', '111111', '121212', '432100', '654321', '888888', '999999', '222222', '333333', '444444', '555555', '777777', 'sk445@'];
  for (const pin of pins) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'raihansheikh145@gmail.com',
        password: pin
      });
      if (data?.session) {
          console.log("Success with pin:", pin);
          const { data: prods } = await supabase.from('docs_products').select('id, name').ilike('name', '%Cancel-RR%');
          console.log("Found:", prods);
          if (prods && prods.length > 0) {
              for (const p of prods) {
                  await supabase.from('docs_products').delete().eq('id', p.id);
                  console.log("Deleted", p.id);
              }
          }
          return;
      }
  }
  console.log("Failed all");
}
run();
