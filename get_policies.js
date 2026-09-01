import pkg from 'pg';
const { Client } = pkg;
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require&supa=base-pooler.x",
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    const res = await client.query("SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'docs_companies'");
    console.log(res.rows);
  } catch (e) {
    console.log(e.message);
  } finally {
    await client.end();
  }
}
run();
