import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/)[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/)[1];

async function run() {
  const res = await fetch(`${url}/rest/v1/docs_companies?id=eq.comp-1`, {
    method: 'GET',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  console.log(await res.json());
}
run();
