import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: p } = await supabase.from('docs_products').select('id, company_id').limit(1).single();
    if (!p) return console.log("No product found");

    const { error, data } = await supabase.from('docs_products').update({
        price: 99.99
    }).eq('id', p.id).select('id');

    console.log("Update Error:", error);
    console.log("Update Data:", data);
}
main().catch(console.error);
