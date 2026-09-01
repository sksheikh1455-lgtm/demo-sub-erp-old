import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: invoices } = await supabase.from('docs_invoices').select('data').limit(1);
  if (invoices && invoices.length > 0) {
      const line = invoices[0].data?.lines?.[0];
      if (line && line.productId) {
          console.log("Checking known product:", line.productId);
          const { data: prod } = await supabase.from('docs_products').select('id, data').eq('id', line.productId);
          console.log("Result:", prod);
      }
  }
}
main();
