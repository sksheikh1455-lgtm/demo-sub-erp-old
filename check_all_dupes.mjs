import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  let allJournals = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('docs_journals')
      .select('id, reference_number, created_at')
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
  allJournals.forEach(d => {
      let baseId = null;
      if (d.id.includes('PAY-')) {
          baseId = d.id.replace('JE-CPAY-', '').replace('JE-VPAY-', '').replace('JE-PAY-', '');
          if (!map[baseId]) map[baseId] = [];
          map[baseId].push(d);
          if (map[baseId].length > 1 && !dupes.includes(baseId)) {
              dupes.push(baseId);
          }
      }
  });
  console.log("Found", dupes.length, "duplicate payment journals");
}
run();
