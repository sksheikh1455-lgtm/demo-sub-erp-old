import pg from 'pg';
const { Client } = pg;
async function test() {
  const client = new Client({
    connectionString: "postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres"
  });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'docs_users';
    `);
    console.log(res.rows);
  } catch(e) { console.error(e.message); } finally { await client.end(); }
}
test();
