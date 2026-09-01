import pg from 'pg';
const { Client } = pg;
async function main() {
  const url = 'postgresql://postgres.buspgzsamhfmjrmmwpmo:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  const url2 = 'postgresql://postgres:sk445%40raihan@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  
  try {
    const client = new Client({ connectionString: url2, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log("Connected successfully to pooler with url2!");
    await client.end();
  } catch (e) {
    console.error("url2 failed:", e.message);
  }
}
main();
