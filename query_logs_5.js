import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: invoices } = await supabase.from('docs_invoices').select('id, data').eq('id', '89879eff-df76-48d0-ae05-3a8f6395d1aa');
  console.log(JSON.stringify(invoices[0].data, null, 2));
}
main();
