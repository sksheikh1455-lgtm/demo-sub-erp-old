import pg from 'pg';
import fs from 'fs';

async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  let url = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
  url = url.replace(/^"|"$/g, '').replace('sk445@raihan@', 'sk445%40raihan%40');

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT indexdef FROM pg_indexes WHERE tablename = 'docs_journals';
  `);
  console.log(res.rows);
  await client.end();
}
main();
