import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
const url = urlMatch[1];
const key = keyMatch[1];

async function run() {
  try {
    // We cannot query information_schema from the REST API due to PostgREST configuration.
    // Instead we can just try to insert a fake record into docs_products and see the error.
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
        company_id: 'comp-1',
        name: 'test',
        sku: 'test'
      })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch(e) {
    console.log(e);
  }
}
run();
