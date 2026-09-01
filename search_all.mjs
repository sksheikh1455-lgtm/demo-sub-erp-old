import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: jor } = await supabase.from('docs_journals').select('id, reference_number, reference, description, created_by_id, prepared_by, data')
    .or(`reference_number.ilike.%1175%,reference.ilike.%1175%,description.ilike.%1175%`);
  
  console.log("All matching journals:");
  (jor || []).forEach(j => {
     console.log(`ID: ${j.id}`);
     console.log(`RefNum: ${j.reference_number}`);
     console.log(`Ref: ${j.reference}`);
     console.log(`Desc: ${j.description}`);
     console.log(`PreparedBy: ${j.prepared_by}`);
     console.log(`Data PreparedBy: ${j.data?.preparedBy}`);
     console.log("---");
  });
}
run();
