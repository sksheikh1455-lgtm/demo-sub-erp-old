
import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();
  const r = await c.query(`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'docs_journals'::regclass;
  `);
  console.log('Constraints on docs_journals:');
  r.rows.forEach(row => console.log(`${row.conname}: ${row.pg_get_constraintdef}`));
  await c.end();
}

run().catch(console.error);
