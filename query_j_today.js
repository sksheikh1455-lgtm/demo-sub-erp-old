import pg from 'pg';
import fs from 'fs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = env.match(/SUPABASE_DB_URL=(.+)/);
  const url = dbUrlMatch[1].trim().replace(/^"|"$/g, '').replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let res = await client.query("SELECT id, status, date, updated_at FROM docs_journals WHERE date >= '2026-07-09' OR updated_at >= '2026-07-09'");
  console.log("Journals for today:", res.rows.length);
  if (res.rows.length > 0) {
    console.log(res.rows.slice(0, 10).map(r => r.id + " " + r.status + " " + r.date).join('\n'));
  }
  await client.end();
}
main();
