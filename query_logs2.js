import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: bills, error: err2 } = await supabase.from('docs_bills').select('id, data').eq('id', 'ba465fe2-e72f-4476-98de-8882e77c13b8');
  
  if (bills && bills.length > 0) {
      const bill = bills[0];
      const lines = bill.data?.lines || [];
      for (const line of lines) {
          const jsonStr = JSON.stringify(line).toLowerCase();
          if (jsonStr.includes('p8022') || jsonStr.includes('3pin socket')) {
              console.log("Matched line in bill ba465fe2:");
              console.log(line);
          }
      }
  }
}
main();
