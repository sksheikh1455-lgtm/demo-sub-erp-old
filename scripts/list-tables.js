import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function listTables() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables:", res.rows.map(r => r.table_name).join(', '));
    
    // Also check columns for journal entries
    const constraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'docs_journals'::regclass
      AND contype = 'u'
    `);
    console.log("docs_journals unique constraints:", JSON.stringify(constraints.rows, null, 2));

    const accSample = await client.query(`
       SELECT data FROM docs_accounts LIMIT 1
    `);
    console.log("docs_accounts sample data:", JSON.stringify(accSample.rows[0]?.data));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

listTables();
