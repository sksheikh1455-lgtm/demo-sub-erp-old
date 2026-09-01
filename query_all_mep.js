import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  let uniqueLines = new Set();
  
  async function fetchAll(table) {
    let all = [];
    let from = 0;
    while (true) {
        const { data } = await supabase.from(table).select('id, data').range(from, from + 999);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
  }
  
  const invoices = await fetchAll('docs_invoices');
  const bills = await fetchAll('docs_bills');
  
  for (const doc of [...invoices, ...bills]) {
    for (const line of (doc.data?.lines || [])) {
       const str = JSON.stringify(line).toLowerCase();
       if (str.includes('p80') || str.includes('primium') || str.includes('premium')) {
          uniqueLines.add(line.description || line.productName);
       }
    }
  }
  
  console.log("Matches:", Array.from(uniqueLines));
}
main();
