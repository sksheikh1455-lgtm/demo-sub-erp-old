import pkg from 'pg';
const { Client } = pkg;
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

async function run() {
  const client = new Client({
    host: 'db.buspgzsamhfmjrmmwpmo.supabase.co',
    port: 6543,
    user: 'postgres',
    password: 'sk445@raihan',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    const res = await client.query("SELECT email FROM auth.users LIMIT 10");
    console.log(res.rows);
  } catch (e) {
    console.log(e.message);
  } finally {
    await client.end();
  }
}
run();
