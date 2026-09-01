import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Testing json functions in postgres...');
  try {
    const res = await client.query(`
      SELECT to_jsonb(r) ->> 'name' as name_extracted
      FROM (SELECT 'John' as name, 25 as age) r;
    `);
    console.log('to_jsonb works:', res.rows);
  } catch (err: any) {
    console.error('to_jsonb failed:', err.message);
  }

  try {
    const res2 = await client.query(`
      SELECT (row_to_json(r)::jsonb) ->> 'name' as name_extracted
      FROM (SELECT 'John' as name, 25 as age) r;
    `);
    console.log('row_to_json works:', res2.rows);
  } catch (err: any) {
    console.error('row_to_json failed:', err.message);
  }

  await client.end();
}
run().catch(console.error);
