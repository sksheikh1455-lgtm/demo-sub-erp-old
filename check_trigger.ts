import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT tgname, pg_get_triggerdef(oid) 
      FROM pg_trigger 
      WHERE tgrelid = 'docs_payments'::regclass;
    `);
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
