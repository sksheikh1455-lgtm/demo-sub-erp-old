import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  const sql = `
    SELECT table_name, column_name, column_default 
    FROM information_schema.columns 
    WHERE table_name LIKE 'docs_%' AND column_name = 'id';
  `;
  const res = await client.query(sql);
  console.log(res.rows);
  await client.end();
}

main();
