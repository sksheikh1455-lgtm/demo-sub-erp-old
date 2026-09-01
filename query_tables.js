import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: products } = await supabase.from('docs_products').select('id, data');
  let count = 0;
  for (const p of products) {
      const n = p.data?.name?.toLowerCase() || '';
      if (n.includes('mep') && n.includes('socket')) {
          console.log(p.data.sku, p.data.name);
          count++;
      }
  }
  console.log("Total mep sockets:", count);
}
main();
