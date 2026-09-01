import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const compIds = ['comp-2'];
  const idsString = compIds.join(',');
  const orCondition = `company_id.in.(${idsString}),company_ids.ov.{${idsString}}`;
  const { data, error } = await supabase.from('docs_products').select('id, name, company_id, company_ids').or(orCondition);
  if (error) console.error("Error:", error);
  else console.log(`Success! Found ${data.length} products. Sample:`, data[0]);
}

run();
