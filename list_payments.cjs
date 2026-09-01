const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: payments, error } = await supabase.from('docs_payments').select('*');
  console.log(`Found ${payments.length} payments.`);
  const matching = payments.filter(p => p.id.includes('178996732') || p.id.includes('178996731') || 
     JSON.stringify(p).includes('178996732') || JSON.stringify(p).includes('178996731'));
  
  console.log('Matching payments:', matching.map(p => p.id));
  
  if (matching.length > 0) {
    for (const p of matching) {
       console.log('Deleting payment', p.id);
       await supabase.from('docs_payments').delete().eq('id', p.id);
       if (p.journal_entry_id) {
          console.log('Deleting journal', p.journal_entry_id);
          await supabase.from('docs_journals').delete().eq('id', p.journal_entry_id);
       }
    }
  }
}
run();
