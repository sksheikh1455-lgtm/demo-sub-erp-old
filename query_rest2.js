import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const url = urlMatch[1];
const key = keyMatch[1];

async function run() {
  try {
    const res = await fetch(`${url}/rest/v1/docs_products`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        id: 'test',
        data: {},
        fake_column: 'test'
      })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.log(e);
  }
}
run();
