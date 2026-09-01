import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function test() {
  const { data } = await supabase.from('docs_journals').select('id, reference_number, data').eq('company_id', 'comp-1').ilike('id', '%PAY-TEST-%');
  console.log("Journals:", JSON.stringify(data, null, 2));
}
test();
