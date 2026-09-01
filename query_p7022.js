import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: prod } = await supabase.from('docs_products').select('id, data');
  let p7022, p8022;
  for (const p of prod) {
      const name = p.data?.name?.toLowerCase() || '';
      const sku = p.data?.sku?.toLowerCase() || '';
      if (name.includes('7022') || sku.includes('7022')) p7022 = p;
      if (name.includes('8022') || sku.includes('8022')) p8022 = p;
  }
  
  if (p7022) console.log("Found P7022:", p7022.id, p7022.data?.name, p7022.data?.sku);
  if (p8022) console.log("Found P8022:", p8022.id, p8022.data?.name, p8022.data?.sku);
  else console.log("P8022 not found!");
}
main();
