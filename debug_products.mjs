import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: companies } = await supabase.from('docs_companies').select('id, name');
  console.log("Companies:", companies);
  
  const { data } = await supabase.from('docs_products').select('id, name, quantity_on_hand, company_id, data, company_ids');
  
  console.log("\nProducts count:", data?.length);
  if (data && data.length > 0) {
      console.log(JSON.stringify(data.slice(0, 5), null, 2));
  }
}
check();
