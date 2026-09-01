import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;
async function test() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`SELECT id, customer_id, data->>'customerId' as d_cid, data->>'contactId' as d_contact_id FROM docs_credit_notes ORDER BY created_at DESC LIMIT 5`);
  console.log(res.rows);
  await client.end();
}
test();
