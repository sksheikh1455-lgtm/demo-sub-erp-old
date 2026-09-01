import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: products } = await supabase.from('docs_products').select('id, data');
  console.log("Total products:", products?.length);
  if (products && products.length > 0) {
      console.log("Sample 5:", products.slice(0, 5).map(p => p.data.name));
  }
}
main();
