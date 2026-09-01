import pkg from 'pg';

const { Client } = pkg;
const connectionString = process.env.SUPABASE_DB_URL;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'update_average_cost';
    `);
    if (rows.length > 0) {
      console.log('--- DEFINITION OF update_average_cost ---');
      console.log(rows[0].prosrc);
    } else {
      console.log('update_average_cost not found');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
