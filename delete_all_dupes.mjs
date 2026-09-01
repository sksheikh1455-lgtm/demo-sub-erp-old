import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY); // Or service key? Anon Key cannot delete unless RLS permits it.

async function run() {
  let allJournals = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('docs_journals')
      .select('id, reference, reference_number, created_at, prepared_by, created_by_id')
      .like('id', 'JE-%PAY-%')
      .range(page * 1000, (page + 1) * 1000 - 1);
    
    if (error) {
      console.error(error);
      break;
    }
    allJournals = allJournals.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  
  const map = {};
  const dupes = [];
  allJournals.forEach(j => {
      const baseId = j.id.replace('JE-CPAY-', '').replace('JE-VPAY-', '').replace('JE-PAY-', '');
      if (!map[baseId]) map[baseId] = [];
      map[baseId].push(j);
  });
  
  for (const [baseId, jors] of Object.entries(map)) {
      if (jors.length > 1) {
          // Find the one that starts with JE-PAY-
          const toDelete = jors.find(j => j.id.startsWith('JE-PAY-'));
          if (toDelete) {
              dupes.push(toDelete.id);
          }
      }
  }
  
  console.log(`Found ${dupes.length} duplicates to delete.`);
  
  // Actually delete them (if RLS allows)
  if (dupes.length > 0) {
    const { data: delLines, error: delErr1 } = await supabase.from('docs_journal_lines').delete().in('journal_id', dupes);
    console.log("Deleted lines:", delErr1 ? delErr1 : "OK");
    
    const { data: delJors, error: delErr2 } = await supabase.from('docs_journals').delete().in('id', dupes);
    console.log("Deleted journals:", delErr2 ? delErr2 : "OK");
  }
}
run();
