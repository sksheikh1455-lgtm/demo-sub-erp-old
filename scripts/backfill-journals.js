import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
  UPDATE docs_journals j
  SET data = jsonb_set(
      COALESCE(j.data, '{}'::jsonb), 
      '{lines}', 
      COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
              'id', id, 
              'accountId', account_id, 
              'debit', debit, 
              'credit', credit, 
              'description', description, 
              'contactId', contact_id
          )) 
          FROM docs_journal_lines 
          WHERE journal_id = j.id
      ), '[]'::jsonb)
  )
  WHERE NOT (COALESCE(j.data, '{}'::jsonb) ? 'lines' AND jsonb_typeof(COALESCE(j.data, '{}'::jsonb)->'lines') = 'array');
  `;

  await client.query(sql);

  console.log('Fixed journals payload successfully!');
  await client.end();
}

run().catch(console.error);
