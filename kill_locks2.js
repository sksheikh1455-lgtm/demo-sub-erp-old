const { Client } = require('pg');
const fs = require('fs');

async function run() {
  let env = fs.readFileSync('.env', 'utf8');
  let url = env.split('\n').find(l => l.startsWith('SUPABASE_DB_URL=')).split('=')[1].trim();
  url = url.replace(/^"|"$/g, '');
  url = url.replace('sk445@raihan@', 'sk445%40raihan%40');
  
  if (url.startsWith('postgresql://')) {
     url = url.replace('postgresql://', 'postgres://');
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");
  const res = await client.query(`
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE pid <> pg_backend_pid() 
      AND datname = current_database();
  `);
  console.log("Terminated:", res.rowCount);
  await client.end();
}
run().catch(console.error);
