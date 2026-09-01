import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' }); 
const supabaseUrl = process.env.VITE_SUPABASE_URL.startsWith('http') ? process.env.VITE_SUPABASE_URL : `https://${process.env.VITE_SUPABASE_URL}.supabase.co`;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('docs_products').select('*');
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  const matches = data.filter(p => {
    const sku = p.data?.sku?.toLowerCase() || '';
    const name = p.data?.name?.toLowerCase() || '';
    return sku.includes('p8022') || name.includes('p8022') || name.includes('3pin socket') || name.includes('3 pin socket');
  });
  console.log("Products found:", matches.length);
  for (const r of matches) {
    console.log("- ID:", r.id, "SKU:", r.data?.sku, "NAME:", r.data?.name, "Archived:", r.data?.isArchived || r.is_archived);
  }
}
main();
