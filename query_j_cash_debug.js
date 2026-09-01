import pg from 'pg';
import fs from 'fs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = env.match(/SUPABASE_DB_URL=(.+)/);
  const url = dbUrlMatch[1].trim().replace(/^"|"$/g, '').replace('sk445@raihan@', 'sk445%40raihan@');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let res = await client.query(`
    SELECT j.id as journal_id, al.id as line_id, al.account_id, acc.code, acc.type
    FROM docs_journals j
    JOIN docs_journal_lines al ON j.id = al.journal_id
    LEFT JOIN docs_accounts acc ON al.account_id = acc.id
    WHERE j.status = 'POSTED' AND j.id IN (
        SELECT journal_id FROM docs_journal_lines 
        WHERE account_id IN (SELECT id FROM docs_accounts WHERE code IN ('100100', '1011') OR type IN ('CASH', 'BANK'))
    ) AND (j.date >= '2026-07-09' OR j.updated_at >= '2026-07-09')
    LIMIT 5;
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
main();
