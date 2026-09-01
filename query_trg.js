import fs from 'fs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  let key = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim().replace(/"/g, '');
  let url = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim().replace(/"/g, '');

  const res = await fetch(url + '/rest/v1/rpc/get_triggers', {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
  });
  console.log(await res.text());
}
main();
