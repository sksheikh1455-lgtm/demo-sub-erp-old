import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const supabase = createClient(urlMatch[1], keyMatch[1]);

async function main() {
  const { data: invoices } = await supabase.from('docs_invoices').select('id, data');
  const { data: bills } = await supabase.from('docs_bills').select('id, data');
  
  for (const inv of (invoices || [])) {
    for (const line of (inv.data?.lines || [])) {
       const str = JSON.stringify(line).toLowerCase();
       if (str.includes('p8022') || str.includes('primium series')) {
          console.log("Invoice Line:", line.productId, line.description, line.productName);
       }
    }
  }
  
  for (const bill of (bills || [])) {
    for (const line of (bill.data?.lines || [])) {
       const str = JSON.stringify(line).toLowerCase();
       if (str.includes('p8022') || str.includes('primium series')) {
          console.log("Bill Line:", line.productId, line.description, line.productName);
       }
    }
  }
}
main();
