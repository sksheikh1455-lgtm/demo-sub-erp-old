import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('run_sql', {
     sql_query: `
        DELETE FROM docs_journals WHERE id LIKE 'JE-PAY-%' AND EXISTS (
            SELECT 1 FROM docs_journals dj2 WHERE dj2.id = REPLACE(docs_journals.id, 'JE-PAY-', 'JE-CPAY-')
        );
        DELETE FROM docs_journals WHERE id LIKE 'JE-PAY-%' AND EXISTS (
            SELECT 1 FROM docs_journals dj2 WHERE dj2.id = REPLACE(docs_journals.id, 'JE-PAY-', 'JE-VPAY-')
        );
     `
  });
  
  if (error) { console.error("RPC Error:", error); return; }
  console.log("Success:", data);
}
run();
