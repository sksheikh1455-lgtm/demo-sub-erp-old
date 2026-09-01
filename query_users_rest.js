import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data, error } = await supabase.from('docs_users').select('id, name, email, company_id, company_ids, data').limit(10);
  console.log("Users:", data);
  console.log("Error:", error);
}
main();
