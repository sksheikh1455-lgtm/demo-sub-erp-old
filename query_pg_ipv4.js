import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const envContent = fs.readFileSync('.env', 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
const dbUrl = dbUrlMatch[1];

async function run() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const res = await client.query("SELECT * FROM auth.users LIMIT 1");
    console.log(res.rows);
  } catch (e) {
    console.log(e.message);
  } finally {
    await client.end();
  }
}
run();
