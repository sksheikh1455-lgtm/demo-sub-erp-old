import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'sync_document_metadata'
  `);
  if (res.rows.length > 0) {
    console.log("Definition of sync_document_metadata:");
    console.log(res.rows[0].prosrc);
  } else {
    console.log("sync_document_metadata not found!");
  }

  await client.end();
}
run();
