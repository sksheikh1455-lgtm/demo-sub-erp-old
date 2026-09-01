import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/)[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/)[1];

async function checkCol(col) {
  const res = await fetch(`${url}/rest/v1/docs_companies`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test', [col]: null })
  });
  const text = await res.text();
  if (text.includes("schema cache")) console.log(`❌ ${col} DOES NOT exist`);
  else console.log(`✅ ${col} EXISTS`);
}
async function run() {
  const cols = ["id", "updated_at", "company_id", "code", "name", "data"];
  for (const col of cols) await checkCol(col);
}
run();
