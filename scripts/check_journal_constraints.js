const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkConstraints() {
  const env = fs.readFileSync('.env', 'utf8');
  const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const supabaseServiceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase.rpc('inspect_table_constraints', { t_name: 'docs_journals' });
  
  if (error) {
    // If RPC doesn't exist, try direct query
    const { data: data2, error: error2 } = await supabase.from('_raw_sql').select('*').csv(); 
    // This probably won't work. I'll use a better approach.
    console.log('Error checking constraints:', error.message);
    
    const { data: data3, error: error3 } = await supabase.rpc('exec_sql', { sql: `
      SELECT
          conname AS constraint_name,
          pg_get_constraintdef(c.oid) AS constraint_definition
      FROM
          pg_constraint c
      JOIN
          pg_namespace n ON n.oid = c.connamespace
      WHERE
          contype = 'u' AND conname LIKE '%journal%';
    `});
    
    if (error3) {
      console.log('Error 3:', error3.message);
    } else {
      console.log('Constraints:', data3);
    }
  } else {
    console.log('Constraints:', data);
  }
}

checkConstraints();
