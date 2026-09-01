import { Client } from 'pg';
async function run() {
  const client = new Client("postgresql://postgres:sk445@raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:6543/postgres");
  await client.connect();
  const { rows } = await client.query(`
    SELECT j.id, j.created_at, l.id as line_id
    FROM docs_journals j
    JOIN docs_journal_lines l ON j.id = l.journal_id
    WHERE j.created_at > NOW() - INTERVAL '1 hour' AND l.id LIKE '%-DR-COGS%'
    ORDER BY j.created_at DESC
  `);
  console.log("Recent journals with -DR-COGS:", rows.length);
  await client.end();
}
run();
