import pg from 'pg';
import fs from 'fs';

async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = env.match(/SUPABASE_DB_URL=(.+)/);
  const url = dbUrlMatch[1].trim().replace(/^"|"$/g, '').replace(/@([a-zA-Z0-9.-]+):6543/, (match, host) => `@${host}:6543`);
  
  // Actually, we can just use URL parsing to fix it safely or just use the same replace:
  const finalUrl = url.replace('sk445@raihan@', 'sk445%40raihan@');

  const client = new pg.Client({ connectionString: finalUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'docs_journals';
  `);
  console.log(res.rows);
  await client.end();
}
main();
