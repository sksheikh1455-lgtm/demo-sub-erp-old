import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/)[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/)[1];

async function run() {
  const res = await fetch(`${url}/rest/v1/docs_companies`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ id: 'comp-1', name: 'Default Company', code: 'DEF', data: {currency: 'USD'} })
  });
  console.log(res.status);
  console.log(await res.text());
}
run();
