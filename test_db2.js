import fs from 'fs';

async function check() {
  const env = fs.readFileSync('.env', 'utf8');
  let url = '', key = '';
  env.split('\n').forEach(l => {
    if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/"/g, '');
    if (l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim().replace(/"/g, '');
  });

  const body = {
    query: "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'unq_journal_num_company';"
  };
  
  // Actually, we can just query using RPC to run raw SQL if we have one. Do we have `run_sql` or similar?
  // Let's use RPC `execute_sql` or similar if it exists.
  
  const res = await fetch(url + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: body.query })
  });
  console.log(res.status);
  console.log(await res.text());
}
check();
