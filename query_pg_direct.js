import pkg from 'pg';
const { Client } = pkg;
async function test() {
  const connectionString = 'postgresql://postgres:sk445%40raihan@db.buspgzsamhfmjrmmwpmo.supabase.co:5432/postgres';
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("Connected directly!");
    const res = await client.query('SELECT count(*) FROM docs_users;');
    console.log("Users:", res.rows[0].count);
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await client.end();
  }
}
test();
