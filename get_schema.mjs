import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function run() {
  const url = "https://buspgzsamhfmjrmmwpmo.supabase.co/rest/v1/docs_products?limit=1";
  const res = await fetch(url, {
    headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey }
  });
  const data = await res.json();
  console.log("Docs products sample:", data);
}
run();
