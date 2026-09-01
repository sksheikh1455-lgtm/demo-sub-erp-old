import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const res = await client.query(`
    SELECT reference_number FROM docs_journals WHERE reference_number LIKE 'JEN-%' LIMIT 5;
  `);
  console.log("JEN journals:", res.rows);
  
  const seqRes = await client.query(`
    SELECT * FROM docs_document_sequences WHERE document_type = 'JEN';
  `);
  console.log("Sequences:", seqRes.rows);
  await client.end();
}
run();
