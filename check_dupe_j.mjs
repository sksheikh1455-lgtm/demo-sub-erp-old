import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('docs_journals').select('id, reference_number, created_at');
  
  const refMap = {};
  const dupes = [];
  data.forEach(d => {
      const match = d.id.match(/JE-[A-Z]*PAY-([A-Z0-9-]+)/);
      if (match) {
          const baseId = match[1];
          if (!refMap[baseId]) refMap[baseId] = [];
          refMap[baseId].push(d);
          if (refMap[baseId].length > 1) {
              dupes.push(baseId);
          }
      }
  });
  console.log("Found", dupes.length, "duplicate payment journals");
  console.log("Example:", dupes[0], refMap[dupes[0]]);
}
run();
