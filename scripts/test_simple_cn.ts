import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
     const t = await client.query('SELECT post_credit_note($1)', ['ceef91d8-277f-4ae4-8b73-e90ff035cd11']);
     console.log('OK', t.rows);
  } catch(e) { console.error(e) }
  client.end();
}
main();
