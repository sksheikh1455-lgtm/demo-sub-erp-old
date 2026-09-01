import pg from 'pg';
import fs from 'fs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = env.match(/SUPABASE_DB_URL=(.+)/);
  const url = dbUrlMatch[1].trim().replace(/^"|"$/g, '').replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let res = await client.query(`
    SELECT j.id, j.status, j.date
    FROM docs_journals j
    WHERE j.status = 'POSTED' AND j.id IN (
        SELECT journal_id FROM docs_journal_lines 
        WHERE account_id IN (SELECT id FROM docs_accounts WHERE code IN ('100100', '1011') OR type IN ('CASH', 'BANK'))
    ) AND (j.date >= '2026-07-09' OR j.updated_at >= '2026-07-09')
  `);
  console.log("Count:", res.rows.length);
  await client.end();
}
main();
