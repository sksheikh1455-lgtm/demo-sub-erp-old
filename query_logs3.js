import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: bills, error: err2 } = await supabase.from('docs_bills').select('id, data');
  let missingProductIds = new Set();
  
  if (bills) {
      for (const bill of bills) {
          const lines = bill.data?.lines || [];
          for (const line of lines) {
              const jsonStr = JSON.stringify(line).toLowerCase();
              if (jsonStr.includes('p8022') || jsonStr.includes('3pin socket')) {
                  console.log("Found in bill:", bill.id);
                  console.log("Line details:", JSON.stringify(line, null, 2));
                  if (line.productId) missingProductIds.add(line.productId);
              }
          }
      }
  }

  const { data: invoices, error: err1 } = await supabase.from('docs_invoices').select('id, data');
  if (invoices) {
      for (const inv of invoices) {
          const lines = inv.data?.lines || [];
          for (const line of lines) {
              const jsonStr = JSON.stringify(line).toLowerCase();
              if (jsonStr.includes('p8022') || jsonStr.includes('3pin socket')) {
                  console.log("Found in invoice:", inv.id);
                  console.log("Line details:", JSON.stringify(line, null, 2));
                  if (line.productId) missingProductIds.add(line.productId);
              }
          }
      }
  }

  for (const pid of Array.from(missingProductIds)) {
      const { data: prod } = await supabase.from('docs_products').select('id, data').eq('id', pid);
      if (!prod || prod.length === 0) {
          console.log("PRODUCT IS DELETED:", pid);
      } else {
          console.log("PRODUCT EXISTS:", pid, JSON.stringify(prod[0].data));
      }
  }
}
main();
