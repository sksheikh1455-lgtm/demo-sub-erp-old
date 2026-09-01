import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);
async function test() {
  const { data, error } = await supabase.from('docs_products').select().limit(1);
  if (data && data.length > 0) {
    console.log("Cols:", Object.keys(data[0]));
  } else {
    console.log("No data");
  }
}
test();
