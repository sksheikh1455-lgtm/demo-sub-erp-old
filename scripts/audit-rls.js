import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://chvpn7eb5frotja3nqgs4c.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('run_sql', {
    sql_query: `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM
        pg_policies
      WHERE
        schemaname = 'public';
    `
  });

  if (error) {
    if (error.code === '42883') {
        const { data: qData, error: qErr } = await supabase.from('pg_policies').select('*').limit(10);
        console.log("direct query error or success", qData, qErr);
    }
    console.error('Error fetching policies via normal RPC, dropping to manual direct REST call or pg-meta if available.');
  } else {
    fs.writeFileSync('policies.json', JSON.stringify(data, null, 2));
    console.log('Policies saved to policies.json');
  }
}

run();
