import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("---- Last 10 docs_journals in DB ----");
  const res = await client.query(`
    select id, reference_number, journal_type, status, created_by_id, data->>'createdById' as json_created_by, data->>'preparedBy' as json_prepared_by
    from docs_journals
    order by updated_at desc
    limit 10;
  `);
  res.rows.forEach(row => {
    console.log(`ID: ${row.id}`);
    console.log(`Ref: ${row.reference_number}`);
    console.log(`Type: ${row.journal_type}`);
    console.log(`Status: ${row.status}`);
    console.log(`Created By ID (Col): ${row.created_by_id}`);
    console.log(`Created By ID (JSON): ${row.json_created_by}`);
    console.log(`Prepared By (JSON): ${row.json_prepared_by}`);
    console.log("----------------------------");
  });

  await client.end();
}

run().catch(console.error);
