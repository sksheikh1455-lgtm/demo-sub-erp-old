import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query(`SELECT id, name, username, email FROM docs_users;`);
  console.log(res.rows);
  await client.end();
}
main();
