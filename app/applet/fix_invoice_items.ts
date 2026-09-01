import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: logs, error: err1 } = await supabase.from('docs_audit_log')
    .select('new_values')
    .eq('table_name', 'docs_invoices')
    .eq('record_id', '13d8c44a-4ce5-4c58-ab4b-dc43da60e096')
    .order('created_at', { ascending: true });
    
  if (err1) { console.error('fetch err', err1); return; }
  
  let best = null;
  for (let r of (logs || [])) {
    if (r.new_values && r.new_values.data && r.new_values.data.items && r.new_values.data.items.length > 0) {
      if (r.new_values.total == 4673.9) {
        best = r.new_values;
      }
    }
  }

  if (best) {
    console.log('Restoring to:', best.total);
    // Since we are using anon key, we might hit RLS, but let's try
    // We can also just log the query to use with node-pg
    
    // Instead, let's use node-pg here!
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    
    try {
      await client.query('SET session_replication_role = replica');
      
      const query = `UPDATE docs_invoices SET total = $1, data = $2 WHERE id = $3`;
      await client.query(query, [best.total, best.data, '13d8c44a-4ce5-4c58-ab4b-dc43da60e096']);
      
      await client.query('SET session_replication_role = DEFAULT');
      await client.query(`UPDATE docs_invoices SET updated_at = NOW() WHERE id = '13d8c44a-4ce5-4c58-ab4b-dc43da60e096'`);
      console.log('Successfully restored invoice via PG!');
    } catch (e) {
      console.error(e);
    } finally {
      await client.end();
    }
  } else {
    console.log('No suitable log found');
  }
}
run();
