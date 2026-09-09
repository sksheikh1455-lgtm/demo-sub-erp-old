import dotenv from 'dotenv';
import fs from 'fs';
const env = dotenv.parse(fs.readFileSync('.env'));
async function run() {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/?apikey=${env.VITE_SUPABASE_ANON_KEY}`);
    const data = await res.json();
    fs.writeFileSync('openapi.json', JSON.stringify(data, null, 2));
}
run();
