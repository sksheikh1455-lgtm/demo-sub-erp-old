import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: prod, error } = await supabase.from('docs_products').select('id, data').eq('id', '5c0180ff-9a7a-4c06-b8f4-2a580c9c2f63');
  console.log("Data:", prod, "Error:", error);
}
main();
