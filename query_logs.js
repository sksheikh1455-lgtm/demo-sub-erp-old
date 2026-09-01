import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: invoices, error: err1 } = await supabase.from('docs_invoices').select('id, data');
  const { data: bills, error: err2 } = await supabase.from('docs_bills').select('id, data');
  
  console.log("Checking invoices and bills for p8022...");
  let found = false;
  
  for (const inv of (invoices || [])) {
    const jsonStr = JSON.stringify(inv.data).toLowerCase();
    if (jsonStr.includes('p8022') || jsonStr.includes('3pin socket')) {
      console.log("Found in Invoice:", inv.id);
      for (const line of (inv.data?.lines || [])) {
          if (JSON.stringify(line).toLowerCase().includes('p8022')) {
              console.log("Line:", line.productId, line.description);
          }
      }
      found = true;
    }
  }
  
  for (const bill of (bills || [])) {
    const jsonStr = JSON.stringify(bill.data).toLowerCase();
    if (jsonStr.includes('p8022') || jsonStr.includes('3pin socket')) {
      console.log("Found in Bill:", bill.id);
      for (const line of (bill.data?.lines || [])) {
          if (JSON.stringify(line).toLowerCase().includes('p8022')) {
              console.log("Line:", line.productId, line.description);
          }
      }
      found = true;
    }
  }
  
  if (!found) {
    console.log("Not found in any invoice or bill.");
  }
}
main();
