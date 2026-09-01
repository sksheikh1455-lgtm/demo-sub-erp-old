import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: invoices } = await supabase.from('docs_invoices').select('id, data');
  let uniqueLines = new Set();
  
  for (const inv of (invoices || [])) {
    for (const line of (inv.data?.lines || [])) {
       const str = JSON.stringify(line).toLowerCase();
       if (str.includes('mep') && str.includes('socket')) {
          const desc = line.description || line.productName;
          uniqueLines.add(desc);
       }
    }
  }
  
  console.log(Array.from(uniqueLines));
}
main();
