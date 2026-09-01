import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
let anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
if (anonKey.startsWith('"') && anonKey.endsWith('"')) {
  anonKey = anonKey.substring(1, anonKey.length - 1);
}

const url = "https://buspgzsamhfmjrmmwpmo.supabase.co";
const supabase = createClient(url, anonKey);

async function run() {
  const { data, error } = await supabase.from('docs_products').select('id, name').limit(5);
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
