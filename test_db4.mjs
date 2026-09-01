import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c3BnenNhbWhmbWpybW13cG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzgxMDgsImV4cCI6MjA5MjkxNDEwOH0.8Pj-NoDqlenxJr2azDs5L-gCfPJ-Bvcdzalq5UqKcRM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const id = 'comp-2';
  const orQuery = `company_id.eq."${id}",company_ids.cs.["${id}"]`;
  const { data, error } = await supabase.from('docs_products').select('id').or(orQuery).limit(1);
  if (error) console.error("Error with orQuery cs JSONB:", error.message);
  else console.log("Success with orQuery cs JSONB!");

  const orQuery2 = `company_id.eq."${id}",company_ids.cs.{${id}}`;
  const { data: d2, error: e2 } = await supabase.from('docs_products').select('id').or(orQuery2).limit(1);
  if (e2) console.error("Error with orQuery cs TEXT ARRAY:", e2.message);
  else console.log("Success with orQuery cs TEXT ARRAY!");
}

run();
