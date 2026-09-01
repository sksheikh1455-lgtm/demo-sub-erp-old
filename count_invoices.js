import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: invoices } = await supabase.from('docs_invoices').select('id');
  const { data: bills } = await supabase.from('docs_bills').select('id');
  console.log("Total invoices:", invoices?.length);
  console.log("Total bills:", bills?.length);
}
main();
